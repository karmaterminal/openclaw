import{h as e,o as t,p as n,r,t as i}from"./string-coerce-BaiOg1Ie.js";import{H as a,I as o,L as s,V as c,h as l,s as u}from"./index-DkskgWFg.js";var d=[`off`,`minimal`,`low`,`medium`,`high`],f=[``,`off`,`on`,`full`],p=[``,`on`,`off`],m=[``,`off`,`on`,`stream`],h=[10,25,50,100];function g(e,t){return Object.prototype.hasOwnProperty.call(e,t)?e[t]??null:null}function _(e){return s(e)??i(e)}function v(e){let n=e.thinkingDefault?t(`sessionsView.defaultOption`,{value:e.thinkingDefault}):t(`sessionsView.inherit`),r=e.thinkingLevels?.length?e.thinkingLevels:(e.thinkingOptions?.length?e.thinkingOptions:d).map(e=>({id:_(e),label:e}));return[{value:``,label:n},...r.map(e=>({value:_(e.id),label:e.label}))]}function y(e,t){return!t||e.includes(t)?[...e]:[...e,t]}function b(e,n){return!n||e.some(e=>e.value===n)?[...e]:[...e,{value:n,label:t(`sessionsView.customOption`,{value:n})}]}function x(){return f.map(e=>({value:e,label:t(e===``?`sessionsView.inherit`:e===`off`?`sessionsView.offExplicit`:`sessionsView.${e}`)}))}function S(){return p.map(e=>({value:e,label:t(e===``?`sessionsView.inherit`:`sessionsView.${e}`)}))}function C(e){return e||null}function w(e,t,n){let r=i(t);return r?e.filter(e=>{let t=i(e.key),a=i(e.label),o=i(e.kind),s=i(e.displayName);if(t.includes(r)||a.includes(r)||o.includes(r)||s.includes(r))return!0;let l=c(e.key);return(l?i(g(n,l.agentId)?.name):``).includes(r)}):e}function T(e,t,n){let r=n===`asc`?1:-1;return[...e].toSorted((e,n)=>{let i=0;switch(t){case`key`:i=(e.key??``).localeCompare(n.key??``);break;case`kind`:i=(e.kind??``).localeCompare(n.kind??``);break;case`updated`:i=(e.updatedAt??0)-(n.updatedAt??0);break;case`tokens`:i=(e.totalTokens??e.inputTokens??e.outputTokens??0)-(n.totalTokens??n.inputTokens??n.outputTokens??0);break}return i*r})}function E(e,t,n){let r=t*n;return e.slice(r,r+n)}function D(e){switch(e){case`manual`:return t(`sessionsView.manual`);case`auto-threshold`:return t(`sessionsView.autoThreshold`);case`overflow-retry`:return t(`sessionsView.overflowRetry`);case`timeout-retry`:return t(`sessionsView.timeoutRetry`);default:return e}}function O(e){return typeof e.tokensBefore==`number`&&typeof e.tokensAfter==`number`&&Number.isFinite(e.tokensBefore)&&Number.isFinite(e.tokensAfter)?t(`sessionsView.tokenRange`,{before:e.tokensBefore.toLocaleString(),after:e.tokensAfter.toLocaleString()}):typeof e.tokensBefore==`number`&&Number.isFinite(e.tokensBefore)?t(`sessionsView.tokensBefore`,{count:e.tokensBefore.toLocaleString()}):t(`sessionsView.tokenDeltaUnavailable`)}function k(r){let i=T(w(r.result?.sessions??[],r.searchQuery,r.agentIdentityById),r.sortColumn,r.sortDir),a=i.length,o=Math.max(1,Math.ceil(a/r.pageSize)),s=Math.min(r.page,o-1),c=E(i,s,r.pageSize),u=(t,n,i=``)=>{let a=r.sortColumn===t,o=a&&r.sortDir===`asc`?`desc`:`asc`;return e`
      <th
        class=${i}
        data-sortable
        data-sort-dir=${a?r.sortDir:``}
        @click=${()=>r.onSortChange(t,a?o:`desc`)}
      >
        ${n}
        <span class="data-table-sort-icon">${l.arrowUpDown}</span>
      </th>
    `};return e`
    <section class="card">
      <div class="row" style="justify-content: space-between; margin-bottom: 12px;">
        <div>
          <div class="card-title">${t(`sessionsView.title`)}</div>
          <div class="card-sub">
            ${r.result?t(`sessionsView.store`,{path:r.result.path}):t(`sessionsView.subtitle`)}
          </div>
        </div>
        <button class="btn" ?disabled=${r.loading} @click=${r.onRefresh}>
          ${r.loading?t(`common.loading`):t(`common.refresh`)}
        </button>
      </div>

      <div class="filters" style="margin-bottom: 12px;">
        <label class="field-inline">
          <span>${t(`sessionsView.active`)}</span>
          <input
            style="width: 72px;"
            placeholder=${t(`sessionsView.minutesPlaceholder`)}
            .value=${r.activeMinutes}
            @input=${e=>r.onFiltersChange({activeMinutes:e.target.value,limit:r.limit,includeGlobal:r.includeGlobal,includeUnknown:r.includeUnknown})}
          />
        </label>
        <label class="field-inline">
          <span>${t(`sessionsView.limit`)}</span>
          <input
            style="width: 64px;"
            .value=${r.limit}
            @input=${e=>r.onFiltersChange({activeMinutes:r.activeMinutes,limit:e.target.value,includeGlobal:r.includeGlobal,includeUnknown:r.includeUnknown})}
          />
        </label>
        <label class="field-inline checkbox">
          <input
            type="checkbox"
            .checked=${r.includeGlobal}
            @change=${e=>r.onFiltersChange({activeMinutes:r.activeMinutes,limit:r.limit,includeGlobal:e.target.checked,includeUnknown:r.includeUnknown})}
          />
          <span>${t(`sessionsView.global`)}</span>
        </label>
        <label class="field-inline checkbox">
          <input
            type="checkbox"
            .checked=${r.includeUnknown}
            @change=${e=>r.onFiltersChange({activeMinutes:r.activeMinutes,limit:r.limit,includeGlobal:r.includeGlobal,includeUnknown:e.target.checked})}
          />
          <span>${t(`sessionsView.unknown`)}</span>
        </label>
      </div>

      ${r.error?e`<div class="callout danger" style="margin-bottom: 12px;">${r.error}</div>`:n}

      <div class="data-table-wrapper">
        <div class="data-table-toolbar">
          <div class="data-table-search">
            <input
              type="text"
              placeholder=${t(`sessionsView.searchPlaceholder`)}
              .value=${r.searchQuery}
              @input=${e=>r.onSearchChange(e.target.value)}
            />
          </div>
        </div>

        ${r.selectedKeys.size>0?e`
              <div class="data-table-bulk-bar">
                <span
                  >${t(`sessionsView.selected`,{count:String(r.selectedKeys.size)})}</span
                >
                <button class="btn btn--sm" @click=${r.onDeselectAll}>
                  ${t(`common.unselect`)}
                </button>
                <button
                  class="btn btn--sm danger"
                  ?disabled=${r.loading}
                  @click=${r.onDeleteSelected}
                >
                  ${l.trash} ${t(`sessionsView.deleteSelected`)}
                </button>
              </div>
            `:n}

        <div class="data-table-container">
          <table class="data-table">
            <thead>
              <tr>
                <th class="data-table-checkbox-col">
                  ${c.length>0?e`<input
                        type="checkbox"
                        .checked=${c.length>0&&c.every(e=>r.selectedKeys.has(e.key))}
                        .indeterminate=${c.some(e=>r.selectedKeys.has(e.key))&&!c.every(e=>r.selectedKeys.has(e.key))}
                        @change=${()=>{c.every(e=>r.selectedKeys.has(e.key))?r.onDeselectPage(c.map(e=>e.key)):r.onSelectPage(c.map(e=>e.key))}}
                        aria-label=${t(`sessionsView.selectAllOnPage`)}
                      />`:n}
                </th>
                ${u(`key`,t(`sessionsView.key`),`data-table-key-col`)}
                <th>${t(`sessionsView.label`)}</th>
                ${u(`kind`,t(`sessionsView.kind`))}
                ${u(`updated`,t(`sessionsView.updated`))}
                ${u(`tokens`,t(`sessionsView.tokens`))}
                <th>${t(`sessionsView.compaction`)}</th>
                <th>${t(`sessionsView.thinking`)}</th>
                <th>${t(`sessionsView.fast`)}</th>
                <th>${t(`sessionsView.verbose`)}</th>
                <th>${t(`sessionsView.reasoning`)}</th>
              </tr>
            </thead>
            <tbody>
              ${c.length===0?e`
                    <tr>
                      <td
                        colspan="11"
                        style="text-align: center; padding: 48px 16px; color: var(--muted)"
                      >
                        ${t(`sessionsView.noSessions`)}
                      </td>
                    </tr>
                  `:c.flatMap(e=>A(e,r))}
            </tbody>
          </table>
        </div>

        ${a>0?e`
              <div class="data-table-pagination">
                <div class="data-table-pagination__info">
                  ${s*r.pageSize+1}-${Math.min((s+1)*r.pageSize,a)}
                  of ${a} row${a===1?``:`s`}
                </div>
                <div class="data-table-pagination__controls">
                  <select
                    style="height: 32px; padding: 0 8px; font-size: 13px; border-radius: var(--radius-md); border: 1px solid var(--border); background: var(--card);"
                    .value=${String(r.pageSize)}
                    @change=${e=>r.onPageSizeChange(Number(e.target.value))}
                  >
                    ${h.map(t=>e`<option value=${t}>${t} per page</option>`)}
                  </select>
                  <button ?disabled=${s<=0} @click=${()=>r.onPageChange(s-1)}>
                    Previous
                  </button>
                  <button
                    ?disabled=${s>=o-1}
                    @click=${()=>r.onPageChange(s+1)}
                  >
                    ${t(`common.next`)}
                  </button>
                </div>
              </div>
            `:n}
      </div>
    </section>
  `}function A(i,s){let l=i.updatedAt?a(i.updatedAt):t(`common.na`),d=i.thinkingLevel??``,f=d?_(d):``,p=b(v(i),f),h=i.fastMode===!0?`on`:i.fastMode===!1?`off`:``,w=b(S(),h),T=i.verboseLevel??``,E=b(x(),T),k=i.reasoningLevel??``,A=y(m,k),j=i.latestCompactionCheckpoint,M=i.compactionCheckpointCount??0,N=s.expandedCheckpointKey===i.key,P=s.checkpointItemsByKey[i.key]??[],F=s.checkpointErrorByKey[i.key],I=r(i.displayName)??null,L=r(i.label)??``,R=!!(I&&I!==i.key&&I!==L),z=c(i.key),B=z?g(s.agentIdentityById,z.agentId):null,V=r(B?.emoji)??``,H=r(B?.name)??``,U=H&&z?`${V?`${V} `:``}${H} (${z.channel})`:null,W=U??i.key,G=i.kind!==`global`,K=G?`${o(`chat`,s.basePath)}?session=${encodeURIComponent(i.key)}`:null,q=i.kind===`direct`?`data-table-badge--direct`:i.kind===`group`?`data-table-badge--group`:i.kind===`global`?`data-table-badge--global`:`data-table-badge--unknown`;return[e`<tr>
      <td class="data-table-checkbox-col">
        <input
          type="checkbox"
          .checked=${s.selectedKeys.has(i.key)}
          @change=${()=>s.onToggleSelect(i.key)}
          aria-label=${t(`sessionsView.selectSession`)}
        />
      </td>
      <td class="data-table-key-col">
        <div
          class=${U?`session-key-cell`:`mono session-key-cell`}
          title=${W}
        >
          ${G?e`<a
                href=${K}
                class="session-link"
                @click=${e=>{e.defaultPrevented||e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey||s.onNavigateToChat&&(e.preventDefault(),s.onNavigateToChat(i.key))}}
                >${U??i.key}</a
              >`:U??i.key}
          ${R?e`<span class="muted session-key-display-name">${I}</span>`:n}
        </div>
      </td>
      <td>
        <input
          .value=${i.label??``}
          ?disabled=${s.loading}
          placeholder=${t(`sessionsView.optionalPlaceholder`)}
          style="width: 100%; max-width: 140px; padding: 6px 10px; font-size: 13px; border: 1px solid var(--border); border-radius: var(--radius-sm);"
          @change=${e=>{let t=r(e.target.value)??null;s.onPatch(i.key,{label:t})}}
        />
      </td>
      <td>
        <span class="data-table-badge ${q}">${i.kind}</span>
      </td>
      <td>${l}</td>
      <td>${u(i)}</td>
      <td>
        <div style="display: grid; gap: 6px;">
          <span class="muted" style="font-size: 12px;">
            ${M>0?t(M===1?`sessionsView.checkpoint`:`sessionsView.checkpoints`,{count:String(M)}):t(`common.none`)}
          </span>
          ${j?e`
                <span style="font-size: 12px;">
                  ${D(j.reason)} ·
                  ${a(j.createdAt)}
                </span>
              `:n}
          <button
            class="btn btn--sm"
            ?disabled=${s.checkpointLoadingKey===i.key}
            @click=${()=>s.onToggleCheckpointDetails(i.key)}
          >
            ${t(N?`sessionsView.hideCheckpoints`:`sessionsView.showCheckpoints`)}
          </button>
        </div>
      </td>
      <td>
        <select
          ?disabled=${s.loading}
          style="padding: 6px 10px; font-size: 13px; border: 1px solid var(--border); border-radius: var(--radius-sm); min-width: 90px;"
          @change=${e=>{let t=e.target.value;s.onPatch(i.key,{thinkingLevel:C(t)})}}
        >
          ${p.map(t=>e`<option value=${t.value} ?selected=${f===t.value}>
                ${t.label}
              </option>`)}
        </select>
      </td>
      <td>
        <select
          ?disabled=${s.loading}
          style="padding: 6px 10px; font-size: 13px; border: 1px solid var(--border); border-radius: var(--radius-sm); min-width: 90px;"
          @change=${e=>{let t=e.target.value;s.onPatch(i.key,{fastMode:t===``?null:t===`on`})}}
        >
          ${w.map(t=>e`<option value=${t.value} ?selected=${h===t.value}>
                ${t.label}
              </option>`)}
        </select>
      </td>
      <td>
        <select
          ?disabled=${s.loading}
          style="padding: 6px 10px; font-size: 13px; border: 1px solid var(--border); border-radius: var(--radius-sm); min-width: 90px;"
          @change=${e=>{let t=e.target.value;s.onPatch(i.key,{verboseLevel:t||null})}}
        >
          ${E.map(t=>e`<option value=${t.value} ?selected=${T===t.value}>
                ${t.label}
              </option>`)}
        </select>
      </td>
      <td>
        <select
          ?disabled=${s.loading}
          style="padding: 6px 10px; font-size: 13px; border: 1px solid var(--border); border-radius: var(--radius-sm); min-width: 90px;"
          @change=${e=>{let t=e.target.value;s.onPatch(i.key,{reasoningLevel:t||null})}}
        >
          ${A.map(n=>e`<option value=${n} ?selected=${k===n}>
                ${n||t(`sessionsView.inherit`)}
              </option>`)}
        </select>
      </td>
    </tr>`,...N?[e`<tr>
            <td colspan="11" style="padding: 0;">
              <div
                style="padding: 14px 16px; border-top: 1px solid var(--border); background: var(--surface-2, rgba(127, 127, 127, 0.05));"
              >
                ${s.checkpointLoadingKey===i.key?e`<div class="muted">${t(`sessionsView.loadingCheckpoints`)}</div>`:F?e`<div class="callout danger">${F}</div>`:P.length===0?e`<div class="muted">${t(`sessionsView.noCheckpoints`)}</div>`:e`
                          <div style="display: grid; gap: 10px;">
                            ${P.map(n=>e`
                                <div
                                  style="border: 1px solid var(--border); border-radius: var(--radius-md); padding: 12px; display: grid; gap: 8px;"
                                >
                                  <div
                                    style="display: flex; gap: 8px; justify-content: space-between; align-items: center; flex-wrap: wrap;"
                                  >
                                    <strong>
                                      ${D(n.reason)} ·
                                      ${a(n.createdAt)}
                                    </strong>
                                    <span class="muted" style="font-size: 12px;">
                                      ${O(n)}
                                    </span>
                                  </div>
                                  ${n.summary?e`<div style="white-space: pre-wrap;">
                                        ${n.summary}
                                      </div>`:e`<div class="muted">${t(`sessionsView.noSummary`)}</div>`}
                                  <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                                    <button
                                      class="btn btn--sm"
                                      ?disabled=${s.checkpointBusyKey===n.checkpointId}
                                      @click=${()=>s.onBranchFromCheckpoint(i.key,n.checkpointId)}
                                    >
                                      ${t(`sessionsView.branchFromCheckpoint`)}
                                    </button>
                                    <button
                                      class="btn btn--sm"
                                      ?disabled=${s.checkpointBusyKey===n.checkpointId}
                                      @click=${()=>s.onRestoreCheckpoint(i.key,n.checkpointId)}
                                    >
                                      ${t(`sessionsView.restoreCheckpoint`)}
                                    </button>
                                  </div>
                                </div>
                              `)}
                          </div>
                        `}
              </div>
            </td>
          </tr>`]:[]]}export{k as renderSessions};
//# sourceMappingURL=sessions-BtCuMKG6.js.map