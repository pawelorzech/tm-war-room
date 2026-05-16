// Generic form-modal helper for write-back actions on torn.com.
//
// Usage:
//   const result = await showFormModal({
//     title: 'Flag off-limits',
//     description: 'Add a reason so the rest of the faction knows why.',
//     fields: [{ name: 'reason', label: 'Reason', placeholder: 'e.g. med-out…' }],
//     submitLabel: 'Flag',
//   });
//   if (result) await flagOffLimits(...result);
//
// Returns null when user cancels. Closes on Escape, backdrop click, and
// Cancel button. Persists nothing — caller owns the data lifecycle.

import { ensurePersistentHost } from './persistent-host';
import { escapeHtml } from './format';

const HOST_KIND = 'modal';

export type FieldType = 'text' | 'textarea' | 'select';

export interface FieldDef {
  name: string;
  label: string;
  type?: FieldType;
  placeholder?: string;
  initialValue?: string;
  options?: { value: string; label: string }[]; // for type === 'select'
  required?: boolean;
}

export interface FormModalConfig {
  title: string;
  description?: string;
  fields: FieldDef[];
  submitLabel?: string;
  cancelLabel?: string;
  /** Optional second action button — typically used for delete. */
  destructiveAction?: { label: string; value: string };
  tone?: 'default' | 'danger';
}

const STYLES = `
  :host { all: initial; }
  * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #c9d1d9; }
  .backdrop {
    position: fixed; inset: 0;
    background: rgba(0,0,0,0.7);
    z-index: 1000000;
    display: flex; align-items: center; justify-content: center;
    animation: fadein 0.15s ease-out;
  }
  .modal {
    background: #161b22;
    border: 1px solid #30363d;
    border-radius: 12px;
    width: calc(100% - 32px);
    max-width: 420px;
    padding: 20px;
    box-shadow: 0 16px 48px rgba(0,0,0,0.6);
  }
  .modal.danger { border-color: #f85149; }
  .modal h3 {
    margin: 0 0 4px;
    font-size: 16px;
    font-weight: 700;
    color: #f0f6fc;
  }
  .modal.danger h3 { color: #f85149; }
  .modal .desc {
    color: #8b949e;
    font-size: 12px;
    margin: 0 0 16px;
    line-height: 1.5;
  }
  .field { margin-bottom: 12px; }
  .field label {
    display: block;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #6e7681;
    font-weight: 600;
    margin-bottom: 4px;
  }
  .field input, .field textarea, .field select {
    width: 100%;
    background: #0d1117;
    border: 1px solid #30363d;
    color: #c9d1d9;
    border-radius: 6px;
    padding: 6px 8px;
    font-size: 13px;
    font-family: inherit;
    outline: none;
  }
  .field input:focus, .field textarea:focus, .field select:focus {
    border-color: #58a6ff;
  }
  .field textarea { min-height: 64px; resize: vertical; }
  .actions {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
    margin-top: 16px;
  }
  .actions .spacer { flex: 1; }
  .btn {
    border: 0;
    border-radius: 6px;
    padding: 8px 16px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    font-family: inherit;
  }
  .btn-cancel { background: #21262d; color: #c9d1d9; }
  .btn-cancel:hover { background: #30363d; }
  .btn-submit { background: #238636; color: #fff; }
  .btn-submit:hover { background: #2ea043; }
  .btn-submit.danger { background: #da3633; }
  .btn-submit.danger:hover { background: #f85149; }
  .btn-destructive { background: transparent; color: #f85149; border: 1px solid #da3633; }
  .btn-destructive:hover { background: rgba(218,54,51,0.1); }
  @keyframes fadein { from { opacity: 0; } to { opacity: 1; } }
`;

export type FormModalResult =
  | { kind: 'submit'; values: Record<string, string> }
  | { kind: 'destructive' }
  | null;

export function showFormModal(config: FormModalConfig): Promise<FormModalResult> {
  return new Promise((resolve) => {
    const { shadow } = ensurePersistentHost({ kind: HOST_KIND, zIndex: 1000000 });
    // Reset host content (one modal at a time).
    shadow.querySelectorAll(':scope > *').forEach((n) => n.remove());

    const style = document.createElement('style');
    style.textContent = STYLES;
    shadow.appendChild(style);

    const backdrop = document.createElement('div');
    backdrop.className = 'backdrop';

    const fieldsHtml = config.fields
      .map((f) => {
        const type = f.type || 'text';
        const initial = f.initialValue ? escapeHtml(f.initialValue) : '';
        const placeholder = f.placeholder ? `placeholder="${escapeHtml(f.placeholder)}"` : '';
        let control = '';
        if (type === 'textarea') {
          control = `<textarea name="${f.name}" ${placeholder}>${initial}</textarea>`;
        } else if (type === 'select') {
          const options = (f.options || [])
            .map(
              (o) =>
                `<option value="${escapeHtml(o.value)}" ${o.value === f.initialValue ? 'selected' : ''}>${escapeHtml(o.label)}</option>`,
            )
            .join('');
          control = `<select name="${f.name}">${options}</select>`;
        } else {
          control = `<input type="text" name="${f.name}" value="${initial}" ${placeholder} />`;
        }
        return `
          <div class="field">
            <label>${escapeHtml(f.label)}</label>
            ${control}
          </div>
        `;
      })
      .join('');

    const destructiveBtn = config.destructiveAction
      ? `<button type="button" class="btn btn-destructive" data-act="destructive">${escapeHtml(config.destructiveAction.label)}</button>`
      : '';

    backdrop.innerHTML = `
      <form class="modal ${config.tone === 'danger' ? 'danger' : ''}">
        <h3>${escapeHtml(config.title)}</h3>
        ${config.description ? `<p class="desc">${escapeHtml(config.description)}</p>` : ''}
        ${fieldsHtml}
        <div class="actions">
          ${destructiveBtn}
          <div class="spacer"></div>
          <button type="button" class="btn btn-cancel" data-act="cancel">${escapeHtml(config.cancelLabel || 'Cancel')}</button>
          <button type="submit" class="btn btn-submit ${config.tone === 'danger' ? 'danger' : ''}">${escapeHtml(config.submitLabel || 'Save')}</button>
        </div>
      </form>
    `;
    shadow.appendChild(backdrop);

    const form = backdrop.querySelector<HTMLFormElement>('form')!;
    const firstField = form.querySelector<HTMLElement>('input, textarea, select');
    firstField?.focus();

    const cleanup = () => {
      backdrop.remove();
      document.removeEventListener('keydown', escHandler);
    };
    const escHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        cleanup();
        resolve(null);
      }
    };
    document.addEventListener('keydown', escHandler);

    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) {
        cleanup();
        resolve(null);
      }
    });
    backdrop.querySelector('[data-act="cancel"]')?.addEventListener('click', () => {
      cleanup();
      resolve(null);
    });
    backdrop.querySelector('[data-act="destructive"]')?.addEventListener('click', () => {
      cleanup();
      resolve({ kind: 'destructive' });
    });

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const data = new FormData(form);
      const values: Record<string, string> = {};
      for (const [k, v] of data.entries()) {
        values[k] = String(v);
      }
      // Required validation.
      for (const f of config.fields) {
        if (f.required && !values[f.name]?.trim()) {
          form.querySelector<HTMLElement>(`[name="${f.name}"]`)?.focus();
          return;
        }
      }
      cleanup();
      resolve({ kind: 'submit', values });
    });
  });
}

