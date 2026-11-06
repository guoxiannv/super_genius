import type { ReactNode } from 'react';
import { activateSkill, editSkill, reviewMemory, saveRole } from '../api';
import styles from '../styles/team.module.css';
import type { Instance, Memory, Role, Skill } from '../types';

export type SaveTeamChange = (action: () => Promise<unknown>, success?: string) => Promise<boolean>;

function TeamCard({ title, children }: { title: string; children: ReactNode }) {
  return <article className={styles.card}><h3>{title}</h3>{children}</article>;
}

export function RoleEditor({ role, instanceCount, saving, save }: {
  role: Role;
  instanceCount: number;
  saving: boolean;
  save: SaveTeamChange;
}) {
  const revision = role.revision || 0;
  return <TeamCard title={role.name}>
    <small>{`${role.id} · ${role.canDelegate ? '可委派' : '不再委派'}`}</small>
    <p>{`保存设定 v${revision} · ${instanceCount} 个历史实例`}</p>
    <form onSubmit={event => {
      event.preventDefault();
      const fields = new FormData(event.currentTarget);
      void save(() => saveRole({
        id: role.id, revision, name: String(fields.get('name')), persona: String(fields.get('persona')),
      }));
    }}>
      <input name="name" aria-label="角色名称" defaultValue={role.name} />
      <textarea name="persona" aria-label="角色职责" defaultValue={role.persona} />
      <button disabled={saving}>保存设定</button>
      <a className={styles.export} href={'/api/team/export?id=' + encodeURIComponent(role.id)} download={role.id + '.json'}>Share as template</a>
    </form>
  </TeamCard>;
}

export function InstanceList({ instances, roles }: { instances: Instance[]; roles: Role[] }) {
  return <div id="instances">
    {instances.map(instance => <TeamCard
      key={instance.id} title={roles.find(role => role.id === instance.role)?.name || instance.role || '角色待识别'}
    >
      <small>{`${instance.id} · 上级 ${instance.parent || '主会话'} · App ${instance.app || '未识别'} · ${instance.createdAt}`}</small>
      <p>{`最近观测 ${instance.observedAt || '尚未观测'} · 角色已加载 v${instance.loadedRoleRevision ?? '未知'}`}</p>
      {instance.catalogError && <p>目录读取失败：{instance.catalogError}</p>}
      {instance.skillCatalog ? <>
        <p>{instance.skillCatalogComplete ? 'Harness 实际可发现 Skill（不表示本轮已调用）' : 'Skill 目录观测不完整'}</p>
        {!instance.skillCatalog.length && <p>本次观测没有可发现的 Skill</p>}
        {instance.skillCatalog.map((skill, index) => <details key={`${skill.name}-${index}`}>
          <summary>{skill.name}</summary>
          <p>{skill.description}</p>
          <pre>{skill.body || skill.bodyError || '尚无正文'}</pre>
          <small>{skill.source} · {skill.provider} · {skill.path || '虚拟资源'}</small>
        </details>)}
      </> : <p>等待此实例的 Harness 目录观测；不能用注册草稿代替真实目录。</p>}
    </TeamCard>)}
  </div>;
}

export function MemoryList({ memories, saving, save }: { memories: Memory[]; saving: boolean; save: SaveTeamChange }) {
  return <div id="memories">
    {memories.map(memory => <TeamCard key={memory.id} title={`${memory.title} · ${memory.status}`}>
      <small>{`${memory.scope}/${memory.key} · v${memory.revision}`}</small>
      <p>{memory.body}</p>
      <small>来源：{memory.source}</small>
      {memory.status === 'proposed' && <button disabled={saving} onClick={() => {
        void save(() => reviewMemory(memory.id, memory.revision, 'active'));
      }}>归并共享记忆</button>}
      {memory.status !== 'retired' && <button disabled={saving} onClick={() => {
        void save(() => reviewMemory(memory.id, memory.revision, 'retired'));
      }}>退役</button>}
    </TeamCard>)}
  </div>;
}

export function SkillEditor({ skill, saving, save }: { skill: Skill; saving: boolean; save: SaveTeamChange }) {
  return <TeamCard title={`${skill.name} · ${skill.status} · v${skill.revision}`}>
    <small>{skill.owner}</small>
    <form onSubmit={event => {
      event.preventDefault();
      const fields = new FormData(event.currentTarget);
      void save(() => editSkill({
        id: skill.id, revision: skill.revision,
        description: String(fields.get('description')), body: String(fields.get('body')), evidence: String(fields.get('evidence')),
      }));
    }}>
      <label htmlFor={skill.id + '-description'}>用途</label>
      <input id={skill.id + '-description'} name="description" defaultValue={skill.description} />
      <label htmlFor={skill.id + '-body'}>步骤与限制</label>
      <textarea id={skill.id + '-body'} name="body" defaultValue={skill.body} />
      <label htmlFor={skill.id + '-evidence'}>来源与验证</label>
      <textarea id={skill.id + '-evidence'} name="evidence" defaultValue={skill.evidence} />
      <button disabled={saving}>保存为新草稿</button>
      {skill.status !== 'active' && <button type="button" disabled={saving} onClick={() => {
        void save(() => activateSkill(skill.id, skill.revision));
      }}>启用此版本</button>}
    </form>
  </TeamCard>;
}
