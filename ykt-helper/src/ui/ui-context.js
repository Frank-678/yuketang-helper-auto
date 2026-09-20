import { storage } from '../core/storage.js';
import { PROBLEM_TYPE_MAP } from '../core/types.js';
import { toast } from './toast.js';
import { emitInternalEvent } from '../core/internal-events.js';

const config = storage.get('config', {});
config.TYPE_MAP = config.TYPE_MAP || PROBLEM_TYPE_MAP;

function saveConfig() {
  try {
    storage.set('config', {
      ...this.config,
      autoJoinEnabled: !!this.config.autoJoinEnabled,
      autoAnswerOnAutoJoin: !!this.config.autoAnswerOnAutoJoin,
    });
    emitInternalEvent('auto-answer-config-changed');
    return true;
  } catch (error) {
    console.warn('[ui.saveConfig] failed', error);
    return false;
  }
}

/**
 * Stable low-level UI runtime object.
 *
 * Business/state modules and panels depend on this object instead of the
 * high-level ui-api aggregator. ui-api augments this same object with panel and
 * notification methods during bootstrap, keeping the dependency graph acyclic.
 */
export const ui = {
  get config() { return config; },
  saveConfig,
  toast,
};
