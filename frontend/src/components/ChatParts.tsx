import type { ReactNode } from 'react';
import styles from '../styles/chat.module.css';

const colors = [styles.c0, styles.c1, styles.c2, styles.c3];

export function Avatar({
  name, index = 0, bot = false, inMessage = false,
}: { name: string; index?: number; bot?: boolean; inMessage?: boolean }) {
  const className = [styles.avatar, colors[index % colors.length], bot && styles.bot, inMessage && styles.inMessage]
    .filter(Boolean).join(' ');
  return <span className={className}>{bot ? 'a.' : name.slice(0, 1)}</span>;
}

export function EmptyState({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return <div className={styles.empty}>
    <div className={styles.emptyGlyph}>✳</div>
    <h2>{title}</h2>
    <p>{children}</p>
    {action}
  </div>;
}

export function Toast({ message }: { message: string }) {
  return <div className={styles.toast} id="toast" role="status" hidden={!message}>{message}</div>;
}
