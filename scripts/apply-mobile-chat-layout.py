"""Apply the narrowly scoped mobile-chat layout patch exactly once.

No header, report asset, tax logic, AI transport, or stored facts are changed.
The companion workflow builds and exercises the patch before committing it.
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
component = ROOT / 'components/DiagnosisChat.tsx'
css = ROOT / 'components/DiagnosisChat.module.css'
source = component.read_text()


def replace_once(old, new):
    global source
    if new in source:
        return
    assert source.count(old) == 1, f'Unexpected source shape: {old[:100]}'
    source = source.replace(old, new, 1)


replace_once('import styles from "./DiagnosisChat.module.css";', 'import styles from "./DiagnosisChat.module.css";\nimport { useDiagnosisViewport } from "./useDiagnosisViewport";')
replace_once('  const transcriptRef = useRef<HTMLDivElement>(null);', '  const transcriptRef = useRef<HTMLDivElement>(null);\n  const workspaceRef = useDiagnosisViewport(stage, input, inputRef, transcriptRef);')
old_size = '''  useEffect(() => {
    if (!inputRef.current) return;
    inputRef.current.style.height = "auto";
    inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 180)}px`;
  }, [input]);'''
if old_size in source:
    source = source.replace(old_size, '  // Composer sizing is handled with mobile viewport changes in useDiagnosisViewport.', 1)
replace_once('<section className={styles.workspace} aria-label="자산승계 사전진단 대화">', '<section ref={workspaceRef} className={styles.workspace} aria-label="자산승계 사전진단 대화"\n      data-chat-layout="mobile-fit-v1" data-chat-stage={stage} data-chat-opening={!hasMessages} data-summary-open={summaryOpen}>')
replace_once('placeholder={hasMessages ? "빠진 내용이나 바꾸고 싶은 내용을 적어주세요…" : "예: 부모님 집을 미리 증여받는 게 좋을지 고민이에요…"}', 'placeholder={hasMessages ? "답변을 적어주세요…" : "궁금한 점을 적어주세요…"}')
component.write_text(source)

marker = '/* Mobile chat: one visible viewport, scrollable messages, persistent composer. */'
addition = '''
/* Mobile chat: one visible viewport, scrollable messages, persistent composer. */
@media (max-width: 760px) {
  .workspace[data-chat-stage="chat"] {
    position: relative; display: flex; flex-direction: column;
    height: var(--chat-available-height, calc(100dvh - 73px)); min-height: 0;
    padding: 8px 12px calc(8px + env(safe-area-inset-bottom, 0px)); font-size: 16px;
  }
  .workspace[data-chat-stage="chat"] .topline {
    flex: 0 0 auto; flex-wrap: nowrap; gap: 8px; padding-bottom: 4px;
  }
  /* Home remains available through the unchanged shared brand link. */
  .workspace[data-chat-stage="chat"] .backLink { display: none; }
  .workspace[data-chat-stage="chat"] .progress {
    order: 0; flex-basis: auto; justify-content: flex-start; gap: 6px;
    padding-top: 0; font-size: 12px; letter-spacing: 0; white-space: nowrap;
  }
  .workspace[data-chat-stage="chat"] .resetButton {
    flex-shrink: 0; margin-left: auto; padding-left: 0; min-height: 44px; font-size: 12px;
  }
  .workspace[data-chat-stage="chat"] .columns {
    position: relative; flex: 1 1 0; min-height: 0; gap: 8px;
  }
  .workspace[data-chat-stage="chat"] .chatColumn {
    display: flex; flex-direction: column; flex: 1 1 0; min-height: 0;
  }
  .workspace[data-chat-stage="chat"] .chatHeading { flex: 0 0 auto; margin-bottom: 4px; }
  .workspace[data-chat-stage="chat"] .chatHeading .eyebrow { display: none; }
  .workspace[data-chat-stage="chat"] .chatHeading h1 { margin: 0; font-size: 21px; line-height: 1.3; }
  .workspace[data-chat-stage="chat"] .connection { flex: 0 0 auto; min-height: 20px; margin-bottom: 8px; font-size: 12px; }
  .workspace[data-chat-stage="chat"] .chatSurface {
    display: flex; flex-direction: column; flex: 1 1 0; min-height: 0; overflow: hidden;
  }
  .workspace[data-chat-stage="chat"] .transcript {
    flex: 1 1 0; height: auto; min-height: 0; overflow-y: auto;
    padding: 12px; scroll-padding-block: 12px;
  }
  .workspace[data-chat-stage="chat"] .welcomeTitle { font-size: 18px; line-height: 1.5; }
  .workspace[data-chat-stage="chat"][data-chat-opening="false"] .welcome { display: none; }
  .workspace[data-chat-stage="chat"] .topicButtons { margin-top: 12px; gap: 8px; }
  .workspace[data-chat-stage="chat"] .topicButton { min-height: 48px; padding: 8px; font-size: 16px; }
  .workspace[data-chat-stage="chat"] .userMessage,
  .workspace[data-chat-stage="chat"] .assistantMessage { max-width: 100%; margin-bottom: 14px; }
  .workspace[data-chat-stage="chat"] .userMessage { padding: 10px 12px; }
  .workspace[data-chat-stage="chat"] .messageText { font-size: 16px; line-height: 1.65; }
  .workspace[data-chat-stage="chat"] .replyActions { margin-top: 10px; }
  .workspace[data-chat-stage="chat"] .replyChoice { min-height: 44px; padding: 8px 10px; font-size: 15px; }
  .workspace[data-chat-stage="chat"] .composerArea { flex: 0 0 auto; padding: 8px; }
  .workspace[data-chat-stage="chat"] .composerLabel { margin: 0 0 4px; font-size: 12px; line-height: 1.5; }
  .workspace[data-chat-stage="chat"] .composer { padding: 4px 4px 4px 10px; gap: 6px; }
  .workspace[data-chat-stage="chat"] .composer textarea {
    min-height: 44px; max-height: 96px; padding: 10px 0; font-size: 16px; line-height: 24px;
    overflow-y: auto; scrollbar-width: thin;
  }
  .workspace[data-chat-stage="chat"] .composer textarea:placeholder-shown { overflow-y: hidden; }
  .workspace[data-chat-stage="chat"] .sendButton { width: 44px; height: 44px; flex: 0 0 44px; }
  .workspace[data-chat-stage="chat"] .composerMeta { display: none; }
  .workspace[data-chat-stage="chat"] .jumpButton { bottom: calc(var(--chat-composer-height, 92px) + 8px); }
  .workspace[data-chat-stage="chat"] .summary { flex: 0 0 auto; margin: 0; }
  .workspace[data-chat-stage="chat"] .summaryToggle { min-height: 44px; padding: 7px 12px; }
  .workspace[data-chat-stage="chat"] .summaryToggle .eyebrow { display: none; }
  .workspace[data-chat-stage="chat"] .summaryToggle h2 { margin: 0; font-size: 14px; line-height: 1.4; }
  .workspace[data-chat-stage="chat"][data-summary-open="true"] .summary {
    position: absolute; z-index: 20; inset: 0; display: flex; flex-direction: column;
    min-height: 0; box-shadow: 0 -4px 20px #26221b18;
  }
  .workspace[data-chat-stage="chat"][data-summary-open="true"] .summaryToggle { flex: 0 0 auto; }
  .workspace[data-chat-stage="chat"][data-summary-open="true"] .summaryBody {
    flex: 1 1 0; min-height: 0; overflow-y: auto; overscroll-behavior-y: contain;
  }
  .workspace[data-chat-stage="chat"] .summaryFields { max-height: none; overflow: visible; }
  .workspace[data-chat-stage="chat"] .notice,
  .workspace[data-chat-stage="chat"] .resetNotice { flex: 0 0 auto; max-height: 30%; overflow: auto; margin-bottom: 8px !important; }
  .workspace[data-chat-stage="chat"][data-keyboard-open="true"] .topline,
  .workspace[data-chat-stage="chat"][data-keyboard-open="true"] .chatHeading,
  .workspace[data-chat-stage="chat"][data-keyboard-open="true"] .connection,
  .workspace[data-chat-stage="chat"][data-keyboard-open="true"] .composerLabel { display: none; }
}
@media (max-width: 340px) {
  .workspace[data-chat-stage="chat"] .progress { gap: 4px; font-size: 11px; }
  .workspace[data-chat-stage="chat"] .chatHeading h1 { font-size: 20px; }
}
'''
current = css.read_text()
if marker not in current:
    css.write_text(current.rstrip() + '\n' + addition)
print('Applied mobile chat layout; reports, shared header, transport and tax logic untouched.')
