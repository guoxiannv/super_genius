import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { errorMessage, getProgress } from '../api';
import { Avatar, EmptyState } from '../components/ChatParts';
import styles from '../styles/chat.module.css';
import type { Message, Person, ProgressStep, VersionPreview } from '../types';

export function ChatLog({ children, logRef, onScroll, onLoad }: {
  children: ReactNode;
  logRef?: RefObject<HTMLDivElement | null>;
  onScroll?: (element: HTMLDivElement) => void;
  onLoad?: () => void;
}) {
  return <div
    className={styles.messages} id="messages" role="log" aria-label="聊天记录" aria-live="polite" ref={logRef}
    onScroll={onScroll && (event => onScroll(event.currentTarget))} onLoadCapture={onLoad}
  >{children}</div>;
}

export const MessageList = memo(function MessageList({ messages, people, logRef, onQuote, onRetry }: {
  messages: Message[];
  people: Person[];
  logRef: RefObject<HTMLDivElement | null>;
  onQuote: (id: string) => void;
  onRetry: (id: string) => void;
}) {
  const nearBottom = useRef(true);
  const follow = useCallback(() => {
    const log = logRef.current;
    if (log && nearBottom.current) log.scrollTo({ top: log.scrollHeight, behavior: 'instant' });
  }, [logRef]);
  useLayoutEffect(follow, [follow, messages]);
  const messageIndex = new Map(messages.map(message => [message.id, message]));
  const peopleIndex = new Map(people.map((person, index) => [person.id, index]));

  return <ChatLog logRef={logRef} onLoad={follow} onScroll={log => {
    nearBottom.current = log.scrollHeight - log.clientHeight - log.scrollTop < 100;
  }}>
    {messages.length ? messages.map(message => <MessageItem
      key={message.id} message={message} quoted={message.reply_to ? messageIndex.get(message.reply_to) : undefined}
      authorIndex={peopleIndex.get(message.person_id ?? '') ?? -1} onQuote={onQuote} onRetry={onRetry}
    />) : <EmptyState title="讨论从这里开始">
      先选择发言身份。普通消息记入讨论，@app-factory 会唤起主服务。
    </EmptyState>}
  </ChatLog>;
});

const deliveryLabels: Record<string, string> = {
  queued: '已存本地 · 等待转发',
  submitted: '已转发 · 等待主服务',
  observed: '已作为上下文接收',
  done: '已处理',
  failed: '转发或处理失败',
  missing_result: '结果待核对',
};

function artifactPaths(message: Message) {
  const dirs = message.artifactDirs ?? [message.artifactDir];
  return Array.from(message.text.matchAll(/!\[[^\]]*\]\(<?([^)>]+)>?\)/g), match => match[1])
    .filter(path => path.startsWith('/') && dirs.some(dir => dir && path.startsWith(dir + '/')));
}

function MessageBody({ message }: { message: Message }) {
  const bubble = <div className={styles.bubble}>
    {message.text.split(/(@app-factory)/gi).map((part, index) => part.toLowerCase() === '@app-factory'
      ? <span className={styles.at} key={index}>{part}</span>
      : part)}
  </div>;
  if (message.type !== 'bot' || message.preview || message.text.length <= 450) return bubble;
  return <>
    <div className={styles.bubble}>{message.text.split('\n').find(line => line.trim()) || '结果说明'}</div>
    <details className={styles.replyDetail}>
      <summary>查看完整说明</summary>
      {bubble}
    </details>
  </>;
}

function MessageItem({ message, quoted, authorIndex, onQuote, onRetry }: {
  message: Message;
  quoted?: Message;
  authorIndex: number;
  onQuote: (id: string) => void;
  onRetry: (id: string) => void;
}) {
  const bot = message.type === 'bot';
  const retryable = message.delivery === 'failed' || message.delivery === 'missing_result';
  const delivery = message.delivery === 'submitted' ? message.stage || 'Router 已接收，正在处理'
    : message.delivery ? deliveryLabels[message.delivery] || message.delivery : '';
  const quote = () => onQuote(message.id);
  const progressCount = message.progress_count ?? 0;

  return <article className={bot ? `${styles.message} ${styles.bot}` : styles.message} data-message-id={message.id}>
    <Avatar name={message.author.name} index={authorIndex} bot={bot} inMessage />
    <div className={styles.messageContent}>
      <div className={styles.messageHead}>
        <b>{message.author.name}</b><span className={styles.role}>{message.author.role}</span>
        <time>{new Date(message.created_at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</time>
      </div>
      {quoted && <div className={styles.quotePreview}>{quoted.author.name}：{quoted.text.slice(0, 120)}</div>}
      <MessageBody message={message} />
      {message.preview && <VersionPreviewCard preview={message.preview} onContinue={quote} />}
      {message.attachments?.map((image, index) => <a key={`${image.id}-${index}`} href={image.url} target="_blank" rel="noopener">
        <img className={styles.chatImage} loading="lazy" src={image.url} alt={image.name || '参考图'} />
      </a>)}
      {bot && artifactPaths(message).map((path, index) => <img
        key={`${path}-${index}`} className={styles.chatImage} loading="lazy"
        src={'/api/media?path=' + encodeURIComponent(path)} alt="Harness 实际输出截图"
      />)}
      {progressCount > 0 && message.disposition !== 'observe' && message.disposition !== 'answer' &&
        <ExecutionDetails id={message.id} count={progressCount} />}
      {message.error && <p className={styles.error}>{message.error}</p>}
      <div className={styles.messageActions} title={retryable ? message.error || '' : undefined}>
        {!bot && <span>{delivery}</span>}
        <button onClick={quote}>回复</button>
        {retryable && <button onClick={() => onRetry(message.id)}>重试 / 查结果</button>}
      </div>
    </div>
  </article>;
}

const deviceNames: Record<string, string> = { phone: '手机', unfolded: '折叠展开', tablet: '平板' };
const previewLabels = { verified: '验证完成', blocked: '有阻碍', preview: '预览 · 验证中' };
const checkLabels = { pending: '待验证', passed: '通过', failed: '未通过', unavailable: '设备不可用' };
const checkClasses = { pending: '', passed: styles.checkPassed, failed: styles.checkFailed, unavailable: '' };

function VersionPreviewCard({ preview, onContinue }: { preview: VersionPreview; onContinue: () => void }) {
  return <section className={styles.versionCard}>
    <b>{preview.revision} · {previewLabels[preview.status] ?? previewLabels.preview}</b>
    <div className={styles.profileChecks}>
      {preview.checks.map(check => <span key={check.profile} className={checkClasses[check.status]} title={check.evidence || ''}>
        {deviceNames[check.profile] || check.profile}：{checkLabels[check.status]}
      </span>)}
    </div>
    <div className={styles.previewGallery}>
      {preview.images.map((image, index) => <figure key={`${image.profile}-${index}`}>
        <a href={image.url} target="_blank" rel="noopener">
          <img className={styles.chatImage} loading="lazy" src={image.url} alt={deviceNames[image.profile] || image.profile} />
        </a>
        <figcaption>{deviceNames[image.profile] || image.profile}</figcaption>
      </figure>)}
    </div>
    <button type="button" onClick={onContinue}>基于 {preview.revision} 继续改</button>
  </section>;
}

function ExecutionDetails({ id, count }: { id: string; count: number }) {
  const [open, setOpen] = useState(false);
  const [steps, setSteps] = useState<ProgressStep[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    void getProgress(id, controller.signal).then(({ progress }) => {
      if (controller.signal.aborted) return;
      setSteps(progress);
      setError('');
    }).catch(error => {
      if (!controller.signal.aborted) setError(errorMessage(error));
    });
    return () => controller.abort();
  }, [id, count, open]);

  return <details className={styles.execution} onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>Harness 执行过程 · {count} 条</summary>
    {steps.map((step, index) => <pre key={index}>{step.role || 'Harness'} · {step.type} {step.text}</pre>)}
    {error && <p className={styles.error}>{error}</p>}
  </details>;
}
