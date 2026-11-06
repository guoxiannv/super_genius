import { useRef } from 'react';
import styles from '../styles/chat.module.css';
import type { Message, Person } from '../types';
import type { PendingImage } from './useAttachments';
import type { useComposer } from './useComposer';

const quickActions = [
  { label: '分析当前进展', prompt: '分析当前进展并给出下一步' },
  { label: '检查一多适配', prompt: '检查当前 App 的一多适配问题' },
  { label: '整理并执行', prompt: '把刚才的讨论整理成任务并开始执行' },
];

export function MessageComposer({ members, quoted, composer }: {
  members: Person[];
  quoted?: Message;
  composer: ReturnType<typeof useComposer>;
}) {
  const { attachments, changeDraft, chooseSpeaker, draft, inputRef, quote, send, sending, speakerId } = composer;
  const fileInput = useRef<HTMLInputElement>(null);

  function mention() {
    const input = inputRef.current;
    if (!input) return;
    input.setRangeText('@app-factory ', input.selectionStart, input.selectionEnd, 'end');
    changeDraft(input.value);
    input.focus();
  }

  return <form className={styles.composer} id="message-form" onSubmit={event => { event.preventDefault(); void send(); }}>
    <div className={styles.composerToolbar}>
      <label>正在以 <select id="speaker" aria-label="发言人员" value={speakerId} onChange={event => chooseSpeaker(event.target.value)}>
        {members.map(person => <option key={person.id} value={person.id}>{person.name} · {person.role}</option>)}
      </select> 发言</label>
      <button type="button" id="attach" onClick={() => fileInput.current?.click()}>＋ 图片</button>
      <input
        ref={fileInput} type="file" id="image-input" accept="image/png,image/jpeg,image/webp" multiple hidden
        onChange={event => {
          const files = Array.from(event.currentTarget.files ?? []);
          event.currentTarget.value = '';
          if (!sending) attachments.add(files);
        }}
      />
      <button type="button" id="mention" className={styles.mention} onClick={mention}>@app-factory</button>
    </div>
    <div className={styles.quickActions} aria-label="任务快捷入口">
      {quickActions.map(({ label, prompt }) => <button
        type="button" key={label} data-quick={prompt} onClick={() => {
          changeDraft(prompt);
          inputRef.current?.focus();
        }}
      >{label}</button>)}
    </div>
    <div id="quote" className={styles.quote} hidden={!quoted}>
      <span id="quote-text">{quoted && `回复 ${quoted.author.name}：${quoted.text.slice(0, 100)}`}</span>
      <button type="button" id="clear-quote" aria-label="取消引用" onClick={() => quote(null)}>×</button>
    </div>
    <AttachmentList images={attachments.images} sending={sending} onRetry={attachments.retry} onRemove={attachments.remove} />
    <label className={styles.srOnly} htmlFor="message-text">消息内容</label>
    <textarea
      ref={inputRef} id="message-text" placeholder="说点什么… 用 @app-factory 交给 Agent"
      rows={3} maxLength={20000} value={draft}
      onChange={event => changeDraft(event.target.value)}
      onKeyDown={event => {
        if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
          event.preventDefault();
          event.currentTarget.form?.requestSubmit();
        }
      }}
      onPaste={event => {
        const images = Array.from(event.clipboardData.files).filter(file => file.type.startsWith('image/'));
        if (images.length) {
          event.preventDefault();
          if (!sending) attachments.add(images);
        }
      }}
    />
    <div className={styles.composerBottom}>
      <span>Enter 发送 · Shift + Enter 换行</span>
      <button className={styles.primary} id="send" disabled={sending}>发送 ↗</button>
    </div>
  </form>;
}

function AttachmentList({ images, sending, onRetry, onRemove }: {
  images: PendingImage[];
  sending: boolean;
  onRetry: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  return <div id="pending-images" className={styles.pendingImages}>
    {images.map(image => <div key={image.id} className={styles.pendingImage}>
      <img src={image.previewUrl} alt={image.name} />
      <div className={styles.pendingImageInfo}>
        <span className={styles.pendingImageName}>{image.name}</span>
        <span className={image.status === 'error' ? styles.error : styles.pendingImageStatus}>
          {image.status === 'ready' ? '已上传' : image.status === 'error' ? image.error : '上传中…'}
        </span>
        {image.status === 'error' && <button type="button" disabled={sending} onClick={() => onRetry(image.id)}>重试</button>}
      </div>
      <button
        type="button" className={styles.pendingImageRemove} disabled={sending}
        aria-label={'移除图片 ' + image.name} onClick={() => onRemove(image.id)}
      >×</button>
    </div>)}
  </div>;
}
