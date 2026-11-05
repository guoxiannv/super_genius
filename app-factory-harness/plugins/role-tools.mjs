/** SDK root sessions have no preset by default; bind before their first model step. */
export const name = 'app-factory-role-tools';
export const inject = ['tools','agentPresets'];
export function apply(ctx, config) {
  if (!config.routerPreset || !config.policies) throw new Error('role-tools requires routerPreset and policies');
  ctx.on('agent/created', async ({agent}) => {
    let preset=ctx.agentPresets.composedPreset(agent.ctx);
    if(!preset){preset=(await ctx.agentPresets.mount(agent.ctx,config.routerPreset)).id;
      if(!ctx.agentPresets.presetForSession(agent.session))agent.session.append('agent-preset/selected',{agentPreset:preset});
    }
    const policy=config.policies[preset];
    if(!policy)throw new Error(`No App Factory tool policy for preset ${preset}`);
    agent.ctx.effect(() => agent.ctx.tools.restrict(policy));
  });
}
