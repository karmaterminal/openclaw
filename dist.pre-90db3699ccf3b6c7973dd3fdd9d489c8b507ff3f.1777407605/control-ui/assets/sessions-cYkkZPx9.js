import{d as e,h as t,l as n,p as r,r as i}from"./i18n-B3qLZCy2.js";import{u as a}from"./format-C6Fj4uuq.js";import{j as o,p as s,s as c}from"./index-y1R4cA0v.js";var l=[`off`,`minimal`,`low`,`medium`,`high`],u=[{value:``,label:`inherit`},{value:`off`,label:`off (explicit)`},{value:`on`,label:`on`},{value:`full`,label:`full`}],d=[{value:``,label:`inherit`},{value:`on`,label:`on`},{value:`off`,label:`off`}],f=[``,`off`,`on`,`stream`],p=[10,25,50,100];function m(e){return[``,...e.thinkingOptions?.length?e.thinkingOptions:l]}function h(e){return e.thinkingOptions?.includes(`on`)===!0}function g(e,t){return!t||e.includes(t)?[...e]:[...e,t]}function _(e,t){return!t||e.some(e=>e.value===t)?[...e]:[...e,{value:t,label:`${t} (custom)`}]}function v(e,t){return!t||!e||e===`off`?e:`on`}function y(e,t){return e?t&&e===`on`?`low`:e:null}function b(e,t){let r=n(t);return r?e.filter(e=>{let t=n(e.key),i=n(e.label),a=n(e.kind),o=n(e.displayName);return t.includes(r)||i.includes(r)||a.includes(r)||o.includes(r)}):e}function x(e,t,n){let r=n===`asc`?1:-1;return[...e].toSorted((e,n)=>{let i=0;switch(t){case`key`:i=(e.key??``).localeCompare(n.key??``);break;case`kind`:i=(e.kind??``).localeCompare(n.kind??``);break;case`updated`:i=(e.updatedAt??0)-(n.updatedAt??0);break;case`tokens`:i=(e.totalTokens??e.inputTokens??e.outputTokens??0)-(n.totalTokens??n.inputTokens??n.outputTokens??0);break}return i*r})}function S(e,t,n){let r=t*n;return e.slice(r,r+n)}function C(e){switch(e){case`manual`:return`manual`;case`auto-threshold`:return`auto-threshold`;case`overflow-retry`:return`overflow retry`;case`timeout-retry`:return`timeout retry`;default:return e}}function w(e){return typeof e.tokensBefore==`number`&&typeof e.tokensAfter==`number`&&Number.isFinite(e.tokensBefore)&&Number.isFinite(e.tokensAfter)?`${e.tokensBefore.toLocaleString()} → ${e.tokensAfter.toLocaleString()} tokens`:typeof e.tokensBefore==`number`&&Number.isFinite(e.tokensBefore)?`${e.tokensBefore.toLocaleString()} tokens before`:`token delta unavailable`}function T(e){let n=x(b(e.result?.sessions??[],e.searchQuery),e.sortColumn,e.sortDir),a=n.length,o=Math.max(1,Math.ceil(a/e.pageSize)),c=Math.min(e.page,o-1),l=S(n,c,e.pageSize),u=(n,r,i=``)=>{let a=e.sortColumn===n,o=a&&e.sortDir===`asc`?`desc`:`asc`;return t`
      <th
        class=${i}
        data-sortable
        data-sort-dir=${a?e.sortDir:``}
        @click=${()=>e.onSortChange(n,a?o:`desc`)}
      >
        ${r}
        <span class="data-table-sort-icon">${s.arrowUpDown}</span>
      </th>
    `};return t`
    <section class="card">
      <div class="row" style="justify-content: space-between; margin-bottom: 12px;">
        <div>
          <div class="card-title">Sessions</div>
          <div class="card-sub">
            ${e.result?`Store: ${e.result.path}`:`Active session keys and per-session overrides.`}
          </div>
        </div>
        <button class="btn" ?disabled=${e.loading} @click=${e.onRefresh}>
          ${e.loading?i(`common.loading`):i(`common.refresh`)}
        </button>
      </div>

      <div class="filters" style="margin-bottom: 12px;">
        <label class="field-inline">
          <span>Active</span>
          <input
            style="width: 72px;"
            placeholder="min"
            .value=${e.activeMinutes}
            @input=${t=>e.onFiltersChange({activeMinutes:t.target.value,limit:e.limit,includeGlobal:e.includeGlobal,includeUnknown:e.includeUnknown})}
          />
        </label>
        <label class="field-inline">
          <span>Limit</span>
          <input
            style="width: 64px;"
            .value=${e.limit}
            @input=${t=>e.onFiltersChange({activeMinutes:e.activeMinutes,limit:t.target.value,includeGlobal:e.includeGlobal,includeUnknown:e.includeUnknown})}
          />
        </label>
        <label class="field-inline checkbox">
          <input
            type="checkbox"
            .checked=${e.includeGlobal}
            @change=${t=>e.onFiltersChange({activeMinutes:e.activeMinutes,limit:e.limit,includeGlobal:t.target.checked,includeUnknown:e.includeUnknown})}
          />
          <span>Global</span>
        </label>
        <label class="field-inline checkbox">
          <input
            type="checkbox"
            .checked=${e.includeUnknown}
            @change=${t=>e.onFiltersChange({activeMinutes:e.activeMinutes,limit:e.limit,includeGlobal:e.includeGlobal,includeUnknown:t.target.checked})}
          />
          <span>Unknown</span>
        </label>
      </div>

      ${e.error?t`<div class="callout danger" style="margin-bottom: 12px;">${e.error}</div>`:r}

      <div class="data-table-wrapper">
        <div class="data-table-toolbar">
          <div class="data-table-search">
            <input
              type="text"
              placeholder="Filter by key, label, kind…"
              .value=${e.searchQuery}
              @input=${t=>e.onSearchChange(t.target.value)}
            />
          </div>
        </div>

        ${e.selectedKeys.size>0?t`
              <div class="data-table-bulk-bar">
                <span>${e.selectedKeys.size} selected</span>
                <button class="btn btn--sm" @click=${e.onDeselectAll}>
                  ${i(`common.unselect`)}
                </button>
                <button
                  class="btn btn--sm danger"
                  ?disabled=${e.loading}
                  @click=${e.onDeleteSelected}
                >
                  ${s.trash} Delete
                </button>
              </div>
            `:r}

        <div class="data-table-container">
          <table class="data-table">
            <thead>
              <tr>
                <th class="data-table-checkbox-col">
                  ${l.length>0?t`<input
                        type="checkbox"
                        .checked=${l.length>0&&l.every(t=>e.selectedKeys.has(t.key))}
                        .indeterminate=${l.some(t=>e.selectedKeys.has(t.key))&&!l.every(t=>e.selectedKeys.has(t.key))}
                        @change=${()=>{l.every(t=>e.selectedKeys.has(t.key))?e.onDeselectPage(l.map(e=>e.key)):e.onSelectPage(l.map(e=>e.key))}}
                        aria-label="Select all on page"
                      />`:r}
                </th>
                ${u(`key`,`Key`,`data-table-key-col`)}
                <th>Label</th>
                ${u(`kind`,`Kind`)} ${u(`updated`,`Updated`)}
                ${u(`tokens`,`Tokens`)}
                <th>Compaction</th>
                <th>Thinking</th>
                <th>Fast</th>
                <th>Verbose</th>
                <th>Reasoning</th>
              </tr>
            </thead>
            <tbody>
              ${l.length===0?t`
                    <tr>
                      <td
                        colspan="11"
                        style="text-align: center; padding: 48px 16px; color: var(--muted)"
                      >
                        No sessions found.
                      </td>
                    </tr>
                  `:l.flatMap(t=>E(t,e))}
            </tbody>
          </table>
        </div>

        ${a>0?t`
              <div class="data-table-pagination">
                <div class="data-table-pagination__info">
                  ${c*e.pageSize+1}-${Math.min((c+1)*e.pageSize,a)}
                  of ${a} row${a===1?``:`s`}
                </div>
                <div class="data-table-pagination__controls">
                  <select
                    style="height: 32px; padding: 0 8px; font-size: 13px; border-radius: var(--radius-md); border: 1px solid var(--border); background: var(--card);"
                    .value=${String(e.pageSize)}
                    @change=${t=>e.onPageSizeChange(Number(t.target.value))}
                  >
                    ${p.map(e=>t`<option value=${e}>${e} per page</option>`)}
                  </select>
                  <button ?disabled=${c<=0} @click=${()=>e.onPageChange(c-1)}>
                    Previous
                  </button>
                  <button
                    ?disabled=${c>=o-1}
                    @click=${()=>e.onPageChange(c+1)}
                  >
                    Next
                  </button>
                </div>
              </div>
            `:r}
      </div>
    </section>
  `}function E(n,s){let l=n.updatedAt?a(n.updatedAt):i(`common.na`),p=n.thinkingLevel??``,b=h(n),x=v(p,b),S=g(m(n),x),T=n.fastMode===!0?`on`:n.fastMode===!1?`off`:``,E=_(d,T),D=n.verboseLevel??``,O=_(u,D),k=n.reasoningLevel??``,A=g(f,k),j=n.latestCompactionCheckpoint,M=n.compactionCheckpointCount??0,N=s.expandedCheckpointKey===n.key,P=s.checkpointItemsByKey[n.key]??[],F=s.checkpointErrorByKey[n.key],I=e(n.displayName)??null,L=e(n.label)??``,R=!!(I&&I!==n.key&&I!==L),z=n.kind!==`global`,B=z?`${o(`chat`,s.basePath)}?session=${encodeURIComponent(n.key)}`:null,V=n.kind===`direct`?`data-table-badge--direct`:n.kind===`group`?`data-table-badge--group`:n.kind===`global`?`data-table-badge--global`:`data-table-badge--unknown`;return[t`<tr>
      <td class="data-table-checkbox-col">
        <input
          type="checkbox"
          .checked=${s.selectedKeys.has(n.key)}
          @change=${()=>s.onToggleSelect(n.key)}
          aria-label="Select session"
        />
      </td>
      <td class="data-table-key-col">
        <div class="mono session-key-cell">
          ${z?t`<a
                href=${B}
                class="session-link"
                @click=${e=>{e.defaultPrevented||e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey||s.onNavigateToChat&&(e.preventDefault(),s.onNavigateToChat(n.key))}}
                >${n.key}</a
              >`:n.key}
          ${R?t`<span class="muted session-key-display-name">${I}</span>`:r}
        </div>
      </td>
      <td>
        <input
          .value=${n.label??``}
          ?disabled=${s.loading}
          placeholder="(optional)"
          style="width: 100%; max-width: 140px; padding: 6px 10px; font-size: 13px; border: 1px solid var(--border); border-radius: var(--radius-sm);"
          @change=${t=>{let r=e(t.target.value)??null;s.onPatch(n.key,{label:r})}}
        />
      </td>
      <td>
        <span class="data-table-badge ${V}">${n.kind}</span>
      </td>
      <td>${l}</td>
      <td>${c(n)}</td>
      <td>
        <div style="display: grid; gap: 6px;">
          <span class="muted" style="font-size: 12px;">
            ${M>0?`${M} checkpoint${M===1?``:`s`}`:`none`}
          </span>
          ${j?t`
                <span style="font-size: 12px;">
                  ${C(j.reason)} ·
                  ${a(j.createdAt)}
                </span>
              `:r}
          <button
            class="btn btn--sm"
            ?disabled=${s.checkpointLoadingKey===n.key}
            @click=${()=>s.onToggleCheckpointDetails(n.key)}
          >
            ${N?`Hide checkpoints`:`Show checkpoints`}
          </button>
        </div>
      </td>
      <td>
        <select
          ?disabled=${s.loading}
          style="padding: 6px 10px; font-size: 13px; border: 1px solid var(--border); border-radius: var(--radius-sm); min-width: 90px;"
          @change=${e=>{let t=e.target.value;s.onPatch(n.key,{thinkingLevel:y(t,b)})}}
        >
          ${S.map(e=>t`<option value=${e} ?selected=${x===e}>
                ${e||`inherit`}
              </option>`)}
        </select>
      </td>
      <td>
        <select
          ?disabled=${s.loading}
          style="padding: 6px 10px; font-size: 13px; border: 1px solid var(--border); border-radius: var(--radius-sm); min-width: 90px;"
          @change=${e=>{let t=e.target.value;s.onPatch(n.key,{fastMode:t===``?null:t===`on`})}}
        >
          ${E.map(e=>t`<option value=${e.value} ?selected=${T===e.value}>
                ${e.label}
              </option>`)}
        </select>
      </td>
      <td>
        <select
          ?disabled=${s.loading}
          style="padding: 6px 10px; font-size: 13px; border: 1px solid var(--border); border-radius: var(--radius-sm); min-width: 90px;"
          @change=${e=>{let t=e.target.value;s.onPatch(n.key,{verboseLevel:t||null})}}
        >
          ${O.map(e=>t`<option value=${e.value} ?selected=${D===e.value}>
                ${e.label}
              </option>`)}
        </select>
      </td>
      <td>
        <select
          ?disabled=${s.loading}
          style="padding: 6px 10px; font-size: 13px; border: 1px solid var(--border); border-radius: var(--radius-sm); min-width: 90px;"
          @change=${e=>{let t=e.target.value;s.onPatch(n.key,{reasoningLevel:t||null})}}
        >
          ${A.map(e=>t`<option value=${e} ?selected=${k===e}>
                ${e||`inherit`}
              </option>`)}
        </select>
      </td>
    </tr>`,...N?[t`<tr>
            <td colspan="11" style="padding: 0;">
              <div
                style="padding: 14px 16px; border-top: 1px solid var(--border); background: var(--surface-2, rgba(127, 127, 127, 0.05));"
              >
                ${s.checkpointLoadingKey===n.key?t`<div class="muted">Loading checkpoints…</div>`:F?t`<div class="callout danger">${F}</div>`:P.length===0?t`<div class="muted">
                          No compaction checkpoints recorded for this session.
                        </div>`:t`
                          <div style="display: grid; gap: 10px;">
                            ${P.map(e=>t`
                                <div
                                  style="border: 1px solid var(--border); border-radius: var(--radius-md); padding: 12px; display: grid; gap: 8px;"
                                >
                                  <div
                                    style="display: flex; gap: 8px; justify-content: space-between; align-items: center; flex-wrap: wrap;"
                                  >
                                    <strong>
                                      ${C(e.reason)} ·
                                      ${a(e.createdAt)}
                                    </strong>
                                    <span class="muted" style="font-size: 12px;">
                                      ${w(e)}
                                    </span>
                                  </div>
                                  ${e.summary?t`<div style="white-space: pre-wrap;">
                                        ${e.summary}
                                      </div>`:t`<div class="muted">No summary captured.</div>`}
                                  <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                                    <button
                                      class="btn btn--sm"
                                      ?disabled=${s.checkpointBusyKey===e.checkpointId}
                                      @click=${()=>s.onBranchFromCheckpoint(n.key,e.checkpointId)}
                                    >
                                      Branch from checkpoint
                                    </button>
                                    <button
                                      class="btn btn--sm"
                                      ?disabled=${s.checkpointBusyKey===e.checkpointId}
                                      @click=${()=>s.onRestoreCheckpoint(n.key,e.checkpointId)}
                                    >
                                      Restore
                                    </button>
                                  </div>
                                </div>
                              `)}
                          </div>
                        `}
              </div>
            </td>
          </tr>`]:[]]}export{T as renderSessions};
//# sourceMappingURL=sessions-cYkkZPx9.js.map