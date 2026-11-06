import { useRef, useState } from 'react';
import { errorMessage, importTemplate } from '../api';
import { Dialog } from '../components/Dialog';
import type { SaveTeamChange } from './TeamSections';

export function TemplateImportDialog({ save, saving, report }: { save: SaveTeamChange; saving: boolean; report: (message: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<{ data: unknown } | null>(null);

  async function load(file?: File) {
    if (!file) return;
    try {
      if (file.size > 1024 * 1024) throw new Error('模板最多 1MB');
      setPreview({ data: JSON.parse(await file.text()) });
    } catch (error) {
      report(errorMessage(error));
    }
  }

  async function confirm() {
    if (!preview) return;
    const saved = await save(() => importTemplate(preview.data), '已导入新角色；Skill 为待验证草稿，下次重启加载角色。');
    if (saved) setPreview(null);
  }

  return <>
    <button id="import" disabled={saving} onClick={() => input.current?.click()}>导入 bot 模板</button>
    <input ref={input} id="file" type="file" accept="application/json" hidden onChange={event => {
      const file = event.currentTarget.files?.[0];
      event.currentTarget.value = '';
      void load(file);
    }} />
    <Dialog id="preview" open={preview !== null} onDismiss={() => setPreview(null)} aria-labelledby="preview-title">
      <h2 id="preview-title">导入预览</h2>
      <p>仅导入文本设定和 Skill；不会安装代码、连接外部服务或带入个人记忆。</p>
      <pre id="preview-text">{preview && JSON.stringify(preview.data, null, 2)}</pre>
      <button id="cancel" onClick={() => setPreview(null)}>取消</button>
      <button id="confirm" disabled={saving} onClick={() => void confirm()}>创建新角色</button>
    </Dialog>
  </>;
}
