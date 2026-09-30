import { BackLink } from "./BackLink"

export default function ExperimentsLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <>
      <BackLink />
      {children}
    </>
  )
}
