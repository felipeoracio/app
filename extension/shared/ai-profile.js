/**
 * UnoWord — local AI profile draft helpers.
 *
 * Phase 1 stores this draft in chrome.storage.local only. Nothing here sends
 * data over the network. The API mapper exists so a future explicit sync can
 * reuse the same shape after Supabase Auth is connected.
 */
(function attach(scope) {
  const TEXT_LIMITS = {
    writingGoal: 2000,
    audience: 500,
    currentProjects: 2000,
    avoidTopics: 1000,
    personalContext: 5000,
  };

  function cleanText(value, max) {
    return String(value == null ? '' : value).trim().slice(0, max);
  }

  function normalizeListInput(value, max) {
    const text = Array.isArray(value) ? value.join(', ') : value;
    return cleanText(text, max);
  }

  function sanitizeDraft(value = {}, updatedAt = null) {
    const source = value && typeof value === 'object' ? value : {};
    const storedUpdatedAt = Number(source.updatedAt);
    return {
      writingGoal: cleanText(source.writingGoal, TEXT_LIMITS.writingGoal),
      audience: cleanText(source.audience, TEXT_LIMITS.audience),
      currentProjects: normalizeListInput(source.currentProjects, TEXT_LIMITS.currentProjects),
      avoidTopics: normalizeListInput(source.avoidTopics, TEXT_LIMITS.avoidTopics),
      personalContext: cleanText(source.personalContext, TEXT_LIMITS.personalContext),
      onboardingCompleted: source.onboardingCompleted === true,
      syncStatus: ['local_only', 'pending', 'synced'].includes(source.syncStatus) ? source.syncStatus : 'local_only',
      syncedAt: Number.isFinite(Number(source.syncedAt)) && Number(source.syncedAt) > 0 ? Number(source.syncedAt) : null,
      updatedAt: Number.isFinite(updatedAt) && updatedAt > 0
        ? updatedAt
        : (Number.isFinite(storedUpdatedAt) && storedUpdatedAt > 0 ? storedUpdatedAt : null),
    };
  }

  function createDraft(overrides = {}) {
    return sanitizeDraft(overrides);
  }

  function splitList(value) {
    return normalizeListInput(value, 5000)
      .split(/[\n,]/)
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 50);
  }

  function hasPersonalization(value) {
    const draft = sanitizeDraft(value);
    return Boolean(
      draft.writingGoal || draft.audience || draft.currentProjects ||
      draft.avoidTopics || draft.personalContext
    );
  }

  function toApiProfile(value) {
    const draft = sanitizeDraft(value);
    return {
      writing_goal: draft.writingGoal || null,
      writing_style: null,
      audience: draft.audience || null,
      primary_topics: [],
      current_projects: splitList(draft.currentProjects),
      favorite_subjects: [],
      avoid_topics: splitList(draft.avoidTopics),
      personal_context: draft.personalContext || null,
      ai_preferences: { source: 'extension_onboarding', sync_status: draft.syncStatus },
    };
  }

  function mergeWithCloud(localValue, cloudValue = {}) {
    const local = toApiProfile(localValue);
    const cloud = cloudValue && typeof cloudValue === 'object' ? cloudValue : {};
    return {
      writing_goal: local.writing_goal || cloud.writing_goal || null,
      writing_style: local.writing_style || cloud.writing_style || null,
      audience: local.audience || cloud.audience || null,
      primary_topics: local.primary_topics.length ? local.primary_topics : (cloud.primary_topics || []),
      current_projects: local.current_projects.length ? local.current_projects : (cloud.current_projects || []),
      favorite_subjects: local.favorite_subjects.length ? local.favorite_subjects : (cloud.favorite_subjects || []),
      avoid_topics: local.avoid_topics.length ? local.avoid_topics : (cloud.avoid_topics || []),
      personal_context: local.personal_context || cloud.personal_context || null,
      ai_preferences: { ...(cloud.ai_preferences || {}), ...local.ai_preferences, sync_status: 'synced' },
    };
  }

  function fromApiProfile(value = {}, existing = {}) {
    return sanitizeDraft({
      ...existing,
      writingGoal: value.writing_goal || '',
      audience: value.audience || '',
      currentProjects: value.current_projects || [],
      avoidTopics: value.avoid_topics || [],
      personalContext: value.personal_context || '',
      onboardingCompleted: true,
      syncStatus: 'synced',
      syncedAt: Date.now(),
    }, Date.now());
  }

  const api = {
    TEXT_LIMITS, cleanText, sanitizeDraft, createDraft, splitList,
    hasPersonalization, toApiProfile, mergeWithCloud, fromApiProfile,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  scope.WCAIProfile = api;
})(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : this));