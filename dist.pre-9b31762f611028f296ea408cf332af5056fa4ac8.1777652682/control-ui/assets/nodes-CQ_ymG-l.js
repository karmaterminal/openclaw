import{d as e,h as t,p as n,r}from"./i18n-B3qLZCy2.js";import{r as i,t as a,u as o}from"./format-C6Fj4uuq.js";import{F as s}from"./index-B4ACMD1E.js";function c(...e){let t=new Set;for(let n of e){if(!n)continue;if(Array.isArray(n)){for(let e of n){let n=e.trim();n&&t.add(n)}continue}let e=n.trim();e&&t.add(e)}return[...t].toSorted()}function l(e,t){let n=new Set(e);return t.every(e=>n.has(e))}function u(e){return{roles:c(e.roles,e.role),scopes:s(e.scopes)}}function d(e){let t=c(e.roles,e.role),n=Array.isArray(e.tokens)?e.tokens:e.tokens?Object.values(e.tokens):void 0;return{roles:n===void 0?t:c(n.filter(e=>!e.revokedAtMs).flatMap(e=>e.role??[])).filter(e=>t.includes(e)),scopes:s(e.scopes)}}function f(e,t){let n=u(e),r=t?d(t):null;return r?l(r.roles,n.roles)?l(r.scopes,n.scopes)?{kind:`re-approval`,requested:n,approved:r}:{kind:`scope-upgrade`,requested:n,approved:r}:{kind:`role-upgrade`,requested:n,approved:r}:{kind:`new-pairing`,requested:n,approved:null}}function p(t){let n=t?.agents??{},r=Array.isArray(n.list)?n.list:[],i=[];return r.forEach((t,n)=>{if(!t||typeof t!=`object`)return;let r=t,a=e(r.id)??``;if(!a)return;let o=e(r.name),s=r.default===!0;i.push({id:a,name:o,isDefault:s,index:n,record:r})}),i}function m(t,n){let r=new Set(n),i=[];for(let n of t){if(!(Array.isArray(n.commands)?n.commands:[]).some(e=>r.has(String(e))))continue;let t=e(n.nodeId)??``;if(!t)continue;let a=e(n.displayName)??t;i.push({id:t,label:a===t?t:`${a} · ${t}`})}return i.sort((e,t)=>e.label.localeCompare(t.label)),i}var h=`__defaults__`,g=[{value:`deny`,label:`Deny`},{value:`allowlist`,label:`Allowlist`},{value:`full`,label:`Full`}],_=[{value:`off`,label:`Off`},{value:`on-miss`,label:`On miss`},{value:`always`,label:`Always`}];function v(e){return e===`allowlist`||e===`full`||e===`deny`?e:`deny`}function y(e){return e===`always`||e===`off`||e===`on-miss`?e:`on-miss`}function b(e){let t=e?.defaults??{};return{security:v(t.security),ask:y(t.ask),askFallback:v(t.askFallback??`deny`),autoAllowSkills:t.autoAllowSkills??!1}}function x(e){return p(e).map(e=>({id:e.id,name:e.name,isDefault:e.isDefault}))}function S(e,t){let n=x(e),r=Object.keys(t?.agents??{}),i=new Map;n.forEach(e=>i.set(e.id,e)),r.forEach(e=>{i.has(e)||i.set(e,{id:e})});let a=Array.from(i.values());return a.length===0&&a.push({id:`main`,isDefault:!0}),a.sort((e,t)=>{if(e.isDefault&&!t.isDefault)return-1;if(!e.isDefault&&t.isDefault)return 1;let n=e.name?.trim()?e.name:e.id,r=t.name?.trim()?t.name:t.id;return n.localeCompare(r)}),a}function C(e,t){return e===h?h:e&&t.some(t=>t.id===e)?e:h}function w(e){let t=e.execApprovalsForm??e.execApprovalsSnapshot?.file??null,n=!!t,r=b(t),i=S(e.configForm,t),a=j(e.nodes),o=e.execApprovalsTarget,s=o===`node`&&e.execApprovalsTargetNodeId?e.execApprovalsTargetNodeId:null;o===`node`&&s&&!a.some(e=>e.id===s)&&(s=null);let c=C(e.execApprovalsSelectedAgent,i),l=c===h?null:(t?.agents??{})[c]??null,u=Array.isArray(l?.allowlist)?l.allowlist??[]:[];return{ready:n,disabled:e.execApprovalsSaving||e.execApprovalsLoading,dirty:e.execApprovalsDirty,loading:e.execApprovalsLoading,saving:e.execApprovalsSaving,form:t,defaults:r,selectedScope:c,selectedAgent:l,agents:i,allowlist:u,target:o,targetNodeId:s,targetNodes:a,onSelectScope:e.onExecApprovalsSelectAgent,onSelectTarget:e.onExecApprovalsTargetChange,onPatch:e.onExecApprovalsPatch,onRemove:e.onExecApprovalsRemove,onLoad:e.onLoadExecApprovals,onSave:e.onSaveExecApprovals}}function T(e){let i=e.ready,a=e.target!==`node`||!!e.targetNodeId;return t`
    <section class="card">
      <div class="row" style="justify-content: space-between; align-items: center;">
        <div>
          <div class="card-title">Exec approvals</div>
          <div class="card-sub">
            Allowlist and approval policy for <span class="mono">exec host=gateway/node</span>.
          </div>
        </div>
        <button
          class="btn"
          ?disabled=${e.disabled||!e.dirty||!a}
          @click=${e.onSave}
        >
          ${e.saving?`Saving…`:`Save`}
        </button>
      </div>

      ${E(e)}
      ${i?t`
            ${D(e)} ${O(e)}
            ${e.selectedScope===h?n:k(e)}
          `:t`<div class="row" style="margin-top: 12px; gap: 12px;">
            <div class="muted">Load exec approvals to edit allowlists.</div>
            <button class="btn" ?disabled=${e.loading||!a} @click=${e.onLoad}>
              ${e.loading?r(`common.loading`):r(`common.loadApprovals`)}
            </button>
          </div>`}
    </section>
  `}function E(e){let r=e.targetNodes.length>0,i=e.targetNodeId??``;return t`
    <div class="list" style="margin-top: 12px;">
      <div class="list-item">
        <div class="list-main">
          <div class="list-title">Target</div>
          <div class="list-sub">Gateway edits local approvals; node edits the selected node.</div>
        </div>
        <div class="list-meta">
          <label class="field">
            <span>Host</span>
            <select
              ?disabled=${e.disabled}
              @change=${t=>{if(t.target.value===`node`){let t=e.targetNodes[0]?.id??null;e.onSelectTarget(`node`,i||t)}else e.onSelectTarget(`gateway`,null)}}
            >
              <option value="gateway" ?selected=${e.target===`gateway`}>Gateway</option>
              <option value="node" ?selected=${e.target===`node`}>Node</option>
            </select>
          </label>
          ${e.target===`node`?t`
                <label class="field">
                  <span>Node</span>
                  <select
                    ?disabled=${e.disabled||!r}
                    @change=${t=>{let n=t.target.value.trim();e.onSelectTarget(`node`,n||null)}}
                  >
                    <option value="" ?selected=${i===``}>Select node</option>
                    ${e.targetNodes.map(e=>t`<option value=${e.id} ?selected=${i===e.id}>
                          ${e.label}
                        </option>`)}
                  </select>
                </label>
              `:n}
        </div>
      </div>
      ${e.target===`node`&&!r?t` <div class="muted">No nodes advertise exec approvals yet.</div> `:n}
    </div>
  `}function D(e){return t`
    <div class="row" style="margin-top: 12px; gap: 8px; flex-wrap: wrap;">
      <span class="label">Scope</span>
      <div class="row" style="gap: 8px; flex-wrap: wrap;">
        <button
          class="btn btn--sm ${e.selectedScope===h?`active`:``}"
          @click=${()=>e.onSelectScope(h)}
        >
          Defaults
        </button>
        ${e.agents.map(n=>{let r=n.name?.trim()?`${n.name} (${n.id})`:n.id;return t`
            <button
              class="btn btn--sm ${e.selectedScope===n.id?`active`:``}"
              @click=${()=>e.onSelectScope(n.id)}
            >
              ${r}
            </button>
          `})}
      </div>
    </div>
  `}function O(e){let r=e.selectedScope===h,i=e.defaults,a=e.selectedAgent??{},o=r?[`defaults`]:[`agents`,e.selectedScope],s=typeof a.security==`string`?a.security:void 0,c=typeof a.ask==`string`?a.ask:void 0,l=typeof a.askFallback==`string`?a.askFallback:void 0,u=r?i.security:s??`__default__`,d=r?i.ask:c??`__default__`,f=r?i.askFallback:l??`__default__`,p=typeof a.autoAllowSkills==`boolean`?a.autoAllowSkills:void 0,m=p??i.autoAllowSkills,v=p==null;return t`
    <div class="list" style="margin-top: 16px;">
      <div class="list-item">
        <div class="list-main">
          <div class="list-title">Security</div>
          <div class="list-sub">
            ${r?`Default security mode.`:`Default: ${i.security}.`}
          </div>
        </div>
        <div class="list-meta">
          <label class="field">
            <span>Mode</span>
            <select
              ?disabled=${e.disabled}
              @change=${t=>{let n=t.target.value;!r&&n===`__default__`?e.onRemove([...o,`security`]):e.onPatch([...o,`security`],n)}}
            >
              ${r?n:t`<option value="__default__" ?selected=${u===`__default__`}>
                    Use default (${i.security})
                  </option>`}
              ${g.map(e=>t`<option value=${e.value} ?selected=${u===e.value}>
                    ${e.label}
                  </option>`)}
            </select>
          </label>
        </div>
      </div>

      <div class="list-item">
        <div class="list-main">
          <div class="list-title">Ask</div>
          <div class="list-sub">
            ${r?`Default prompt policy.`:`Default: ${i.ask}.`}
          </div>
        </div>
        <div class="list-meta">
          <label class="field">
            <span>Mode</span>
            <select
              ?disabled=${e.disabled}
              @change=${t=>{let n=t.target.value;!r&&n===`__default__`?e.onRemove([...o,`ask`]):e.onPatch([...o,`ask`],n)}}
            >
              ${r?n:t`<option value="__default__" ?selected=${d===`__default__`}>
                    Use default (${i.ask})
                  </option>`}
              ${_.map(e=>t`<option value=${e.value} ?selected=${d===e.value}>
                    ${e.label}
                  </option>`)}
            </select>
          </label>
        </div>
      </div>

      <div class="list-item">
        <div class="list-main">
          <div class="list-title">Ask fallback</div>
          <div class="list-sub">
            ${r?`Applied when the UI prompt is unavailable.`:`Default: ${i.askFallback}.`}
          </div>
        </div>
        <div class="list-meta">
          <label class="field">
            <span>Fallback</span>
            <select
              ?disabled=${e.disabled}
              @change=${t=>{let n=t.target.value;!r&&n===`__default__`?e.onRemove([...o,`askFallback`]):e.onPatch([...o,`askFallback`],n)}}
            >
              ${r?n:t`<option value="__default__" ?selected=${f===`__default__`}>
                    Use default (${i.askFallback})
                  </option>`}
              ${g.map(e=>t`<option value=${e.value} ?selected=${f===e.value}>
                    ${e.label}
                  </option>`)}
            </select>
          </label>
        </div>
      </div>

      <div class="list-item">
        <div class="list-main">
          <div class="list-title">Auto-allow skill CLIs</div>
          <div class="list-sub">
            ${r?`Allow skill executables listed by the Gateway.`:v?`Using default (${i.autoAllowSkills?`on`:`off`}).`:`Override (${m?`on`:`off`}).`}
          </div>
        </div>
        <div class="list-meta">
          <label class="field">
            <span>Enabled</span>
            <input
              type="checkbox"
              ?disabled=${e.disabled}
              .checked=${m}
              @change=${t=>{let n=t.target;e.onPatch([...o,`autoAllowSkills`],n.checked)}}
            />
          </label>
          ${!r&&!v?t`<button
                class="btn btn--sm"
                ?disabled=${e.disabled}
                @click=${()=>e.onRemove([...o,`autoAllowSkills`])}
              >
                Use default
              </button>`:n}
        </div>
      </div>
    </div>
  `}function k(e){let n=[`agents`,e.selectedScope,`allowlist`],r=e.allowlist;return t`
    <div class="row" style="margin-top: 18px; justify-content: space-between;">
      <div>
        <div class="card-title">Allowlist</div>
        <div class="card-sub">Case-insensitive glob patterns.</div>
      </div>
      <button
        class="btn btn--sm"
        ?disabled=${e.disabled}
        @click=${()=>{let t=[...r,{pattern:``}];e.onPatch(n,t)}}
      >
        Add pattern
      </button>
    </div>
    <div class="list" style="margin-top: 12px;">
      ${r.length===0?t` <div class="muted">No allowlist entries yet.</div> `:r.map((t,n)=>A(e,t,n))}
    </div>
  `}function A(e,r,i){let s=r.lastUsedAt?o(r.lastUsedAt):`never`,c=r.lastUsedCommand?a(r.lastUsedCommand,120):null,l=r.lastResolvedPath?a(r.lastResolvedPath,120):null;return t`
    <div class="list-item">
      <div class="list-main">
        <div class="list-title">${r.pattern?.trim()?r.pattern:`New pattern`}</div>
        <div class="list-sub">Last used: ${s}</div>
        ${c?t`<div class="list-sub mono">${c}</div>`:n}
        ${l?t`<div class="list-sub mono">${l}</div>`:n}
      </div>
      <div class="list-meta">
        <label class="field">
          <span>Pattern</span>
          <input
            type="text"
            .value=${r.pattern??``}
            ?disabled=${e.disabled}
            @input=${t=>{let n=t.target;e.onPatch([`agents`,e.selectedScope,`allowlist`,i,`pattern`],n.value)}}
          />
        </label>
        <button
          class="btn btn--sm danger"
          ?disabled=${e.disabled}
          @click=${()=>{if(e.allowlist.length<=1){e.onRemove([`agents`,e.selectedScope,`allowlist`]);return}e.onRemove([`agents`,e.selectedScope,`allowlist`,i])}}
        >
          Remove
        </button>
      </div>
    </div>
  `}function j(e){return m(e,[`system.execApprovals.get`,`system.execApprovals.set`])}function M(e){let n=B(e);return t`
    ${T(w(e))} ${V(n)} ${N(e)}
    <section class="card">
      <div class="row" style="justify-content: space-between;">
        <div>
          <div class="card-title">Nodes</div>
          <div class="card-sub">Paired devices and live links.</div>
        </div>
        <button class="btn" ?disabled=${e.loading} @click=${e.onRefresh}>
          ${e.loading?r(`common.loading`):r(`common.refresh`)}
        </button>
      </div>
      <div class="list" style="margin-top: 16px;">
        ${e.nodes.length===0?t` <div class="muted">No nodes found.</div> `:e.nodes.map(e=>G(e))}
      </div>
    </section>
  `}function N(i){let a=i.devicesList??{pending:[],paired:[]},o=Array.isArray(a.pending)?a.pending:[],s=Array.isArray(a.paired)?a.paired:[],c=new Map(s.map(t=>[e(t.deviceId),t]).filter(e=>!!e[0]));return t`
    <section class="card">
      <div class="row" style="justify-content: space-between;">
        <div>
          <div class="card-title">Devices</div>
          <div class="card-sub">Pairing requests + role tokens.</div>
        </div>
        <button class="btn" ?disabled=${i.devicesLoading} @click=${i.onDevicesRefresh}>
          ${i.devicesLoading?r(`common.loading`):r(`common.refresh`)}
        </button>
      </div>
      ${i.devicesError?t`<div class="callout danger" style="margin-top: 12px;">${i.devicesError}</div>`:n}
      <div class="list" style="margin-top: 16px;">
        ${o.length>0?t`
              <div class="muted" style="margin-bottom: 8px;">Pending</div>
              ${o.map(e=>L(e,i,P(c,e)))}
            `:n}
        ${s.length>0?t`
              <div class="muted" style="margin-top: 12px; margin-bottom: 8px;">Paired</div>
              ${s.map(e=>R(e,i))}
            `:n}
        ${o.length===0&&s.length===0?t` <div class="muted">No paired devices.</div> `:n}
      </div>
    </section>
  `}function P(t,n){let r=e(n.deviceId);if(!r)return;let i=t.get(r);if(!i)return;let a=e(n.publicKey),o=e(i.publicKey);if(!(a&&o&&a!==o))return i}function F(e){return e?`roles: ${i(e.roles)} · scopes: ${i(e.scopes)}`:`none`}function I(e){switch(e){case`scope-upgrade`:return`scope upgrade requires approval`;case`role-upgrade`:return`role upgrade requires approval`;case`re-approval`:return`reconnect details changed; approval required`;case`new-pairing`:return`new device pairing request`}throw Error(`unsupported pending approval kind`)}function L(i,a,s){let c=e(i.displayName)||i.deviceId,l=typeof i.ts==`number`?o(i.ts):r(`common.na`),u=f(i,s),d=i.isRepair?` · repair`:``,p=i.remoteIp?` · ${i.remoteIp}`:``;return t`
    <div class="list-item">
      <div class="list-main">
        <div class="list-title">${c}</div>
        <div class="list-sub">${i.deviceId}${p}</div>
        <div class="muted" style="margin-top: 6px;">
          ${I(u.kind)} · requested ${l}${d}
        </div>
        <div class="muted" style="margin-top: 6px;">
          requested: ${F(u.requested)}
        </div>
        ${u.approved?t`
              <div class="muted" style="margin-top: 6px;">
                approved now: ${F(u.approved)}
              </div>
            `:n}
      </div>
      <div class="list-meta">
        <div class="row" style="justify-content: flex-end; gap: 8px; flex-wrap: wrap;">
          <button class="btn btn--sm primary" @click=${()=>a.onDeviceApprove(i.requestId)}>
            Approve
          </button>
          <button class="btn btn--sm" @click=${()=>a.onDeviceReject(i.requestId)}>
            Reject
          </button>
        </div>
      </div>
    </div>
  `}function R(n,r){let a=e(n.displayName)||n.deviceId,o=n.remoteIp?` · ${n.remoteIp}`:``,s=`roles: ${i(n.roles)}`,c=`scopes: ${i(n.scopes)}`,l=Array.isArray(n.tokens)?n.tokens:[];return t`
    <div class="list-item">
      <div class="list-main">
        <div class="list-title">${a}</div>
        <div class="list-sub">${n.deviceId}${o}</div>
        <div class="muted" style="margin-top: 6px;">${s} · ${c}</div>
        ${l.length===0?t` <div class="muted" style="margin-top: 6px">Tokens: none</div> `:t`
              <div class="muted" style="margin-top: 10px;">Tokens</div>
              <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 6px;">
                ${l.map(e=>z(n.deviceId,e,r))}
              </div>
            `}
      </div>
    </div>
  `}function z(e,r,a){let s=r.revokedAtMs?`revoked`:`active`,c=`scopes: ${i(r.scopes)}`,l=o(r.rotatedAtMs??r.createdAtMs??r.lastUsedAtMs??null);return t`
    <div class="row" style="justify-content: space-between; gap: 8px;">
      <div class="list-sub">${r.role} · ${s} · ${c} · ${l}</div>
      <div class="row" style="justify-content: flex-end; gap: 6px; flex-wrap: wrap;">
        <button
          class="btn btn--sm"
          @click=${()=>a.onDeviceRotate(e,r.role,r.scopes)}
        >
          Rotate
        </button>
        ${r.revokedAtMs?n:t`
              <button
                class="btn btn--sm danger"
                @click=${()=>a.onDeviceRevoke(e,r.role)}
              >
                Revoke
              </button>
            `}
      </div>
    </div>
  `}function B(e){let t=e.configForm,n=U(e.nodes),{defaultBinding:r,agents:i}=W(t);return{ready:!!t,disabled:e.configSaving||e.configFormMode===`raw`,configDirty:e.configDirty,configLoading:e.configLoading,configSaving:e.configSaving,defaultBinding:r,agents:i,nodes:n,onBindDefault:e.onBindDefault,onBindAgent:e.onBindAgent,onSave:e.onSaveBindings,onLoadConfig:e.onLoadConfig,formMode:e.configFormMode}}function V(e){let i=e.nodes.length>0,a=e.defaultBinding??``;return t`
    <section class="card">
      <div class="row" style="justify-content: space-between; align-items: center;">
        <div>
          <div class="card-title">${r(`nodes.binding.execNodeBinding`)}</div>
          <div class="card-sub">${r(`nodes.binding.execNodeBindingSubtitle`)}</div>
        </div>
        <button
          class="btn"
          ?disabled=${e.disabled||!e.configDirty}
          @click=${e.onSave}
        >
          ${e.configSaving?r(`common.saving`):r(`common.save`)}
        </button>
      </div>

      ${e.formMode===`raw`?t`
            <div class="callout warn" style="margin-top: 12px">
              ${r(`nodes.binding.formModeHint`)}
            </div>
          `:n}
      ${e.ready?t`
            <div class="list" style="margin-top: 16px;">
              <div class="list-item">
                <div class="list-main">
                  <div class="list-title">${r(`nodes.binding.defaultBinding`)}</div>
                  <div class="list-sub">${r(`nodes.binding.defaultBindingHint`)}</div>
                </div>
                <div class="list-meta">
                  <label class="field">
                    <span>${r(`nodes.binding.node`)}</span>
                    <select
                      ?disabled=${e.disabled||!i}
                      @change=${t=>{let n=t.target.value.trim();e.onBindDefault(n||null)}}
                    >
                      <option value="" ?selected=${a===``}>Any node</option>
                      ${e.nodes.map(e=>t`<option value=${e.id} ?selected=${a===e.id}>
                            ${e.label}
                          </option>`)}
                    </select>
                  </label>
                  ${i?n:t` <div class="muted">No nodes with system.run available.</div> `}
                </div>
              </div>

              ${e.agents.length===0?t` <div class="muted">No agents found.</div> `:e.agents.map(t=>H(t,e))}
            </div>
          `:t`<div class="row" style="margin-top: 12px; gap: 12px;">
            <div class="muted">${r(`nodes.binding.loadConfigHint`)}</div>
            <button class="btn" ?disabled=${e.configLoading} @click=${e.onLoadConfig}>
              ${e.configLoading?r(`common.loading`):r(`common.loadConfig`)}
            </button>
          </div>`}
    </section>
  `}function H(e,n){let r=e.binding??`__default__`,i=e.name?.trim()?`${e.name} (${e.id})`:e.id,a=n.nodes.length>0;return t`
    <div class="list-item">
      <div class="list-main">
        <div class="list-title">${i}</div>
        <div class="list-sub">
          ${e.isDefault?`default agent`:`agent`} ·
          ${r===`__default__`?`uses default (${n.defaultBinding??`any`})`:`override: ${e.binding}`}
        </div>
      </div>
      <div class="list-meta">
        <label class="field">
          <span>Binding</span>
          <select
            ?disabled=${n.disabled||!a}
            @change=${t=>{let r=t.target.value.trim();n.onBindAgent(e.index,r===`__default__`?null:r)}}
          >
            <option value="__default__" ?selected=${r===`__default__`}>
              Use default
            </option>
            ${n.nodes.map(e=>t`<option value=${e.id} ?selected=${r===e.id}>
                  ${e.label}
                </option>`)}
          </select>
        </label>
      </div>
    </div>
  `}function U(e){return m(e,[`system.run`])}function W(e){let t={id:`main`,name:void 0,index:0,isDefault:!0,binding:null};if(!e||typeof e!=`object`)return{defaultBinding:null,agents:[t]};let n=(e.tools??{}).exec??{},r=typeof n.node==`string`&&n.node.trim()?n.node.trim():null,i=e.agents??{};if(!Array.isArray(i.list)||i.list.length===0)return{defaultBinding:r,agents:[t]};let a=p(e).map(e=>{let t=(e.record.tools??{}).exec??{},n=typeof t.node==`string`&&t.node.trim()?t.node.trim():null;return{id:e.id,name:e.name,index:e.index,isDefault:e.isDefault,binding:n}});return a.length===0&&a.push(t),{defaultBinding:r,agents:a}}function G(e){let n=!!e.connected,r=!!e.paired,i=typeof e.displayName==`string`&&e.displayName.trim()||(typeof e.nodeId==`string`?e.nodeId:`unknown`),a=Array.isArray(e.caps)?e.caps:[],o=Array.isArray(e.commands)?e.commands:[];return t`
    <div class="list-item">
      <div class="list-main">
        <div class="list-title">${i}</div>
        <div class="list-sub">
          ${typeof e.nodeId==`string`?e.nodeId:``}
          ${typeof e.remoteIp==`string`?` · ${e.remoteIp}`:``}
          ${typeof e.version==`string`?` · ${e.version}`:``}
        </div>
        <div class="chip-row" style="margin-top: 6px;">
          <span class="chip">${r?`paired`:`unpaired`}</span>
          <span class="chip ${n?`chip-ok`:`chip-warn`}">
            ${n?`connected`:`offline`}
          </span>
          ${a.slice(0,12).map(e=>t`<span class="chip">${String(e)}</span>`)}
          ${o.slice(0,8).map(e=>t`<span class="chip">${String(e)}</span>`)}
        </div>
      </div>
    </div>
  `}export{M as renderNodes};
//# sourceMappingURL=nodes-CQ_ymG-l.js.map