'use client'
import { useId, useState, type FormEvent } from 'react'
import { LexicalComposer } from '@lexical/react/LexicalComposer'
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin'
import { ContentEditable } from '@lexical/react/LexicalContentEditable'
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin'
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin'
import { LinkPlugin } from '@lexical/react/LexicalLinkPlugin'
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { LinkNode, TOGGLE_LINK_COMMAND } from '@lexical/link'
import { FORMAT_TEXT_COMMAND, UNDO_COMMAND, REDO_COMMAND } from 'lexical'
import * as Checkbox from '@radix-ui/react-checkbox'
import { Check } from 'lucide-react'
import type { SiteInfo } from '../data/content'
import { infoDocument, safeInfoUrl, validateInfoDocument } from '../data/info-document'
import { saveRecord } from './Editors'
import SaveAction from './SaveAction'
import styles from './dashboard.module.css'

function fingerprint(document: string) {
  try { return JSON.stringify(validateInfoDocument(JSON.parse(document))) }
  catch { return document } // Invalid/empty edits must still be editable and report validation on save.
}

function Toolbar() {
  const [editor] = useLexicalComposerContext()
  function link() {
    const url = window.prompt('Link URL (https://…, mailto:…, or #contact). Leave empty to remove.')
    if (url === null) return
    if (url && !safeInfoUrl(url)) { window.alert('Use https, http, mailto, or #contact.'); return }
    editor.dispatchCommand(TOGGLE_LINK_COMMAND, url || null)
  }
  return <div className={styles.richToolbar} role="toolbar" aria-label="Bio formatting">
    <button type="button" onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'bold')}><strong>Bold</strong></button>
    <button type="button" onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'italic')}><em>Italic</em></button>
    <button type="button" onClick={link}>Link</button>
    <button type="button" onClick={() => editor.dispatchCommand(TOGGLE_LINK_COMMAND, '#contact')}>Contact link</button>
    <button type="button" aria-label="Undo" onClick={() => editor.dispatchCommand(UNDO_COMMAND, undefined)}>Undo</button>
    <button type="button" aria-label="Redo" onClick={() => editor.dispatchCommand(REDO_COMMAND, undefined)}>Redo</button>
  </div>
}
export default function InfoEditor({ info, saved }: { info: SiteInfo; saved: () => void }) {
  const formId = useId()
  const [document, setDocument] = useState(() => JSON.stringify(infoDocument(info)))
  const [availableForWork, setAvailableForWork] = useState(Boolean(info.available_for_work))
  const [savedKey, setSavedKey] = useState(() => JSON.stringify([fingerprint(document), Boolean(info.available_for_work)]))
  const changeKey = JSON.stringify([fingerprint(document), availableForWork])
  const dirty = changeKey !== savedKey
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  async function submit(event: FormEvent) {
    event.preventDefault(); if (!dirty || busy) return
    setBusy(true); setStatus('')
    try { await saveRecord({ type: 'info', document: JSON.parse(document), availableForWork }); setSavedKey(changeKey); saved() }
    catch (error) { setStatus(error instanceof Error ? error.message : 'Could not save.') }
    finally { setBusy(false) }
  }
  return <form id={formId} className={styles.editor} onSubmit={submit}>
    <LexicalComposer initialConfig={{ namespace: 'SiteInfo', nodes: [LinkNode], editorState: document, theme: { text: { bold: styles.bold, italic: styles.italic } }, onError: error => { throw error } }}>
      <label id="bio-label">Bio</label>
      <Toolbar />
      <RichTextPlugin contentEditable={<ContentEditable className={styles.richEditor} aria-labelledby="bio-label" />} ErrorBoundary={LexicalErrorBoundary} />
      <HistoryPlugin /><LinkPlugin validateUrl={safeInfoUrl} />
      <OnChangePlugin ignoreSelectionChange onChange={state => setDocument(JSON.stringify(state.toJSON()))} />
    </LexicalComposer>
    <div className={styles.checkbox}>
      <Checkbox.Root id={`${formId}-available`} checked={availableForWork} onCheckedChange={value => setAvailableForWork(value === true)} className={styles.checkboxControl}>
        <Checkbox.Indicator className={styles.checkboxIndicator}><Check size={14} aria-hidden="true" /></Checkbox.Indicator>
      </Checkbox.Root>
      <label htmlFor={`${formId}-available`}>Show “Available for new work” on the homepage</label>
    </div>
    <SaveAction><button className={styles.primaryButton} form={formId} disabled={busy || !dirty}>{busy ? 'Saving…' : 'Save changes'}</button><span role="status">{status}</span></SaveAction>
  </form>
}
