import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2"
import { NextResponse } from "next/server"

import { SITE } from "../../data/site"

/** Sending needs the SDK's Node runtime, not the edge one. */
export const runtime = "nodejs"

const MAX_NAME = 120
const MAX_EMAIL = 254
const MAX_MESSAGE = 5000
/** Anything shorter is almost always a bot or a misfire. */
const MIN_MESSAGE = 10

/** Deliberately loose: the real proof an address works is the reply landing. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

type Payload = {
  name?: unknown
  email?: unknown
  message?: unknown
  /** Honeypot. Real people never see this field, so anything in it is a bot. */
  company?: unknown
}

function asString(value: unknown, limit: number): string {
  return typeof value === "string" ? value.trim().slice(0, limit) : ""
}

/**
 * Header injection guard. Name and email land in Reply-To, so a newline there
 * could otherwise append headers of the sender's choosing.
 */
function singleLine(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim()
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function client(): SESv2Client {
  // One IAM key covers both services: an access key is an identity, not a
  // per-service token, and this user carries ses:SendEmail alongside its S3
  // rights. The S3_ prefix is history, not scope — a leak costs both, so split
  // them if mail and media should ever stop sharing a blast radius.
  const region = process.env.S3_REGION
  const accessKeyId = process.env.S3_ACCESS_KEY_ID
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY

  if (!region || !accessKeyId || !secretAccessKey) {
    throw new Error("AWS credentials are not configured")
  }

  return new SESv2Client({
    region,
    credentials: { accessKeyId, secretAccessKey },
  })
}

export async function POST(request: Request) {
  let body: Payload

  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 })
  }

  // Silently accept honeypot hits: telling a bot it failed only helps it retry.
  if (asString(body.company, 50).length > 0) {
    return NextResponse.json({ ok: true })
  }

  const name = singleLine(asString(body.name, MAX_NAME))
  const email = singleLine(asString(body.email, MAX_EMAIL))
  const message = asString(body.message, MAX_MESSAGE)

  if (!name) {
    return NextResponse.json({ error: "Add your name." }, { status: 400 })
  }
  if (!EMAIL_PATTERN.test(email)) {
    return NextResponse.json(
      { error: "That email address does not look right." },
      { status: 400 },
    )
  }
  if (message.length < MIN_MESSAGE) {
    return NextResponse.json(
      { error: "Add a little more detail." },
      { status: 400 },
    )
  }

  const from = process.env.CONTACT_FROM
  if (!from) {
    console.error("CONTACT_FROM is not set")
    return NextResponse.json(
      { error: "Contact is not configured right now." },
      { status: 500 },
    )
  }

  try {
    await client().send(
      new SendEmailCommand({
        // Used verbatim, so CONTACT_FROM may be a bare address or a full
        // `Name <addr>`. Either way the address must be an SES-verified
        // identity. The visitor goes in Reply-To instead, so replying from the
        // inbox reaches them and DMARC still passes.
        FromEmailAddress: from,
        Destination: { ToAddresses: [SITE.email] },
        ReplyToAddresses: [`${name} <${email}>`],
        Content: {
          Simple: {
            Subject: { Data: `${SITE.name} — ${name}`, Charset: "UTF-8" },
            Body: {
              Text: {
                Data: `From: ${name} <${email}>\n\n${message}`,
                Charset: "UTF-8",
              },
              Html: {
                Data:
                  `<p><strong>${escapeHtml(name)}</strong> ` +
                  `&lt;${escapeHtml(email)}&gt;</p>` +
                  `<p style="white-space:pre-wrap">${escapeHtml(message)}</p>`,
                Charset: "UTF-8",
              },
            },
          },
        },
      }),
    )
  } catch (error) {
    // The real reason (bad key, unverified identity) stays server-side.
    console.error("SES send failed", error)
    return NextResponse.json(
      { error: "Could not send that. Try again, or email directly." },
      { status: 502 },
    )
  }

  return NextResponse.json({ ok: true })
}
