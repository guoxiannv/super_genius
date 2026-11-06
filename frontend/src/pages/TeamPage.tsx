import { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage, getTeam } from '../api';
import styles from '../styles/team.module.css';
import { InstanceList, MemoryList, RoleEditor, SkillEditor } from '../team/TeamSections';
import { TemplateImportDialog } from '../team/TemplateImportDialog';
import type { TeamSnapshot } from '../types';

export function TeamPage() {
  const [snapshot, setSnapshot] = useState<TeamSnapshot>();
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);
  const mutation = useRef(false);
  const loadSequence = useRef(0);
  const embedded = new URLSearchParams(location.search).has('embedded');

  const load = useCallback(async (signal?: AbortSignal) => {
    const sequence = ++loadSequence.current;
    const data = await getTeam(signal);
    if (!signal?.aborted && sequence === loadSequence.current) setSnapshot(data);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal).catch(error => {
      if (!controller.signal.aborted) setStatus(errorMessage(error));
    });
    return () => controller.abort();
  }, [load]);

  async function save(action: () => Promise<unknown>, success = '已保存') {
    if (mutation.current) return false;
    mutation.current = true;
    setSaving(true);
    try {
      await action();
      setStatus(success);
      await load().catch(error => setStatus(errorMessage(error)));
      return true;
    } catch (error) {
      setStatus(errorMessage(error));
      return false;
    } finally {
      mutation.current = false;
      setSaving(false);
    }
  }

  return <div className={embedded ? styles.embedded : undefined}>
    <header>
      {!embedded && <a href="/">← 群聊</a>}
      <h1>团队工作室</h1>
      <p>幕僚长统筹，专业角色积累经验，分身执行任务。</p>
      <button id="refresh" disabled={saving} onClick={() => void load().catch(error => setStatus(errorMessage(error)))}>刷新</button>
      <TemplateImportDialog save={save} saving={saving} report={setStatus} />
      <p className={styles.status} id="status" role="status">{status || (snapshot?.demo ? '演示数据 · 未连接 Harness' : '')}</p>
    </header>
    <main>
      <section>
        <h2>角色与分身设定</h2>
        <p>角色修改与模板导入保存后，在下次 Harness 重启时加载；不会打断当前任务。</p>
        <div id="roles" className={styles.grid}>
          {snapshot?.roles.map(role => <RoleEditor
            key={role.id + ':' + (role.revision || 0)} role={role}
            instanceCount={snapshot.instances.filter(instance => instance.role === role.id).length} saving={saving} save={save}
          />)}
        </div>
      </section>
      <section>
        <h2>实例记录</h2>
        <p>记录已创建的 Harness session，不代表实例此刻正在运行。</p>
        <InstanceList roles={snapshot?.roles ?? []} instances={snapshot?.instances ?? []} />
      </section>
      <section>
        <h2>分层记忆</h2>
        <p>团队共享 / App / 角色 / 分身。此本机管理页可查看全部；Agent 工具按范围过滤。</p>
        <MemoryList memories={snapshot?.memories ?? []} saving={saving} save={save} />
      </section>
      <section>
        <h2>Skill 工坊</h2>
        <p>Agent 可自行沉淀草稿；启用后在下次 Harness 重启时进入对应角色的原生 Skill 列表。</p>
        <div id="skills">{snapshot?.skills.map(skill => <SkillEditor key={skill.id + ':' + skill.revision} skill={skill} saving={saving} save={save} />)}</div>
      </section>
    </main>
  </div>;
}
