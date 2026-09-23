/**
 * Word Count — Localization (English / Spanish)
 *
 * Every user-facing string flows through `t(key, vars?)`. Keys are grouped
 * by surface for easy scanning.  When the language changes, callers
 * re-render their UI via `applyI18n(root)`.
 *
 * This module is loaded in the popup, content-script, and dashboard.
 * It stores no state itself — the current language comes from
 * `chrome.storage.local` (`wc_settings.language`) and is exposed via
 * `setLang()` / `getLang()`.
 */

(function attach(scope) {
  const DICT = {
    en: {
      // brand & header
      'brand.name': 'Word Count',
      'header.history': 'History',
      'header.settings': 'Settings',
      'header.dashboard': 'Dashboard',
      'badge.pro': 'PRO',
      'nav.back': 'Back',

      // session / core
      'session.eyebrowIdle': 'Ready to write?',
      'session.eyebrowActive': 'Writing Session',
      'session.eyebrowDone': 'Session complete',
      'session.words': 'words',
      'session.word': 'word',
      'session.wordsTyped': 'words typed',
      'session.wordTyped': 'word typed',
      'session.pastedSuffix': '+ {n} pasted',
      'session.goalLabel': 'Goal: {n} words',
      'session.goalReached': 'Goal reached',
      'session.duration': 'Session duration',
      'session.start': 'Start Session',
      'session.stop': 'Stop Session',
      'session.new': 'Start New Session',
      'session.helperIdle': 'Start a session and your words will be counted as you write.',
      'session.helperActive': 'Keep writing anywhere in Chrome — your session runs in the background.',
      'session.helperDone': 'Your session is saved locally. Start a new one whenever you like.',

      // onboarding (paste preference)
      'paste.welcome': 'Welcome',
      'paste.question': 'How should pasted text be counted?',
      'paste.helper': 'You can change this later in settings.',
      'paste.separateTitle': 'Keep separate',
      'paste.separateSub': 'Track typed and pasted words in two counts.',
      'paste.astypedTitle': 'Count pasted as typed',
      'paste.astypedSub': 'Combine everything into a single word count.',

      // upgrade cta (free)
      'upgrade.cta.title': 'Unlock Your Writing Progress',
      'upgrade.cta.sub': 'Daily prompts, writing goals & a history of your progress.',
      'upgrade.cta.btn': 'Upgrade',

      // upgrade screen
      'upgrade.headline': 'Write With Purpose',
      'upgrade.sub': 'Turn writing into a habit you can see.',
      'upgrade.free.title': 'Free',
      'upgrade.free.price': '$0',
      'upgrade.free.f1': 'Writing sessions',
      'upgrade.free.f2': 'Live word counter',
      'upgrade.free.f3': 'Session results',
      'upgrade.pro.title': 'Pro',
      'upgrade.pro.price': '$4.99',
      'upgrade.pro.per': '/ month',
      'upgrade.pro.f1': 'Everything in Free',
      'upgrade.pro.f2': 'Personalized daily prompts',
      'upgrade.pro.f3': 'Writing themes',
      'upgrade.pro.f4': 'Session writing goals',
      'upgrade.pro.f5': 'Writing history & progress',
      'upgrade.pro.f6': 'English & Spanish',
      'upgrade.tryPro': 'Try Pro',
      'upgrade.demoNote': 'Demo mode — no payment collected. Toggle off anytime.',

      // pro onboarding
      'onboard.step': 'Step {n} of 4',
      'onboard.headline': "Let's make writing a habit.",
      'onboard.sub': "Choose how much you'd like to write and the kinds of things you'd enjoy writing about.",
      'onboard.begin': 'Begin',
      'onboard.language.title': 'Choose your language',
      'onboard.language.sub': 'You can change this any time in Settings.',
      'onboard.goal.title': 'Choose session goal',
      'onboard.goal.question': 'How many words would you like to write per session?',
      'onboard.goal.rule': 'Your goal must be in increments of 25 words.',
      'onboard.goal.invalid': 'Please enter a goal in increments of 25 words.',
      'onboard.goal.suggest': 'Try {a} or {b} words.',
      'onboard.themes.title': 'Choose writing themes',
      'onboard.themes.sub': 'Pick a few — your daily prompt will draw from these.',
      'onboard.themes.min': 'Choose at least one theme.',
      'onboard.done.title': "You're all set.",
      'onboard.done.sub': 'Your first prompt is waiting inside.',
      'onboard.finish': 'Enter Pro',
      'onboard.continue': 'Continue',

      // prompt card
      'prompt.today': "Today's writing prompt",
      'prompt.yourGoal': 'Your goal: {n} words',
      'prompt.start': 'Start Writing',
      'prompt.another': 'Another prompt',
      'prompt.themesEmpty': 'Choose your themes to see a prompt.',
      'prompt.editThemes': 'Edit themes',

      // history
      'history.title': 'Recent sessions',
      'history.empty1': 'Your completed sessions will appear here.',
      'history.empty2': 'Kept locally on this device only.',
      'history.today': 'Today',
      'history.yesterday': 'Yesterday',
      'history.summary.none': 'No sessions yet',
      'history.summary.saved': '{n} session saved',
      'history.summary.savedPlural': '{n} sessions saved',
      'history.summary.today': '{words} words today · {sessions} session',
      'history.summary.todayPlural': '{words} words today · {sessions} sessions',
      'history.clear': 'Clear history',

      // settings
      'settings.title': 'Settings',
      'settings.writing': 'Writing',
      'settings.goalRow': 'Writing goal',
      'settings.goalMeta': '{n} words per session',
      'settings.themesRow': 'Prompt themes',
      'settings.themesMetaEmpty': 'None selected',
      'settings.pasteRow': 'Paste handling',
      'settings.pasteSeparate': 'Keep separate',
      'settings.pasteAsTyped': 'Count pasted as typed',
      'settings.appearance': 'Appearance',
      'settings.language': 'Language',
      'settings.account': 'Account',
      'settings.plan': 'Plan',
      'settings.planFree': 'Free',
      'settings.planPro': 'Pro (demo)',
      'settings.cancelPro': 'Turn off Pro (demo)',
      'settings.upgradeRow': 'Upgrade to Pro',
      'settings.proBadge': 'PRO',
      'settings.privacy': 'Your writing never leaves this device.',
      'settings.edit': 'Edit',
      'settings.save': 'Save',
      'settings.themesSaveMin': 'Choose at least one theme.',

      // dashboard link
      'dash.viewFull': 'View full stats',
      'dash.title': 'Your writing',
      'dash.tabs.today': 'Today',
      'dash.tabs.week': 'This week',
      'dash.tabs.month': 'This month',
      'dash.tabs.year': 'This year',
      'dash.tabs.all': 'All time',
      'dash.primaryWords': '{n} words',
      'dash.primarySub.today': 'today',
      'dash.primarySub.week': 'this week',
      'dash.primarySub.month': 'this month',
      'dash.primarySub.year': 'this year',
      'dash.primarySub.all': 'all time',
      'dash.goal': 'Goal',
      'dash.progress': 'Progress',
      'dash.sessions': '{n} session',
      'dash.sessionsPlural': '{n} sessions',
      'dash.recent': 'Recent sessions',
      'dash.noData': 'No writing recorded yet in this range.',
      'dash.avgPerDay': 'Avg per day',
      'dash.bestDay': 'Best day',
      'dash.longestSession': 'Longest session',
      'dash.free.banner': 'Unlock this dashboard with Pro',
      'dash.free.bannerSub': 'Daily prompts, writing goals, and history at a glance.',
      'dash.free.upgrade': 'Upgrade',

      // days of week (Mon-first)
      'day.mon': 'Mon', 'day.tue': 'Tue', 'day.wed': 'Wed', 'day.thu': 'Thu',
      'day.fri': 'Fri', 'day.sat': 'Sat', 'day.sun': 'Sun',
      'month.jan': 'Jan', 'month.feb': 'Feb', 'month.mar': 'Mar',
      'month.apr': 'Apr', 'month.may': 'May', 'month.jun': 'Jun',
      'month.jul': 'Jul', 'month.aug': 'Aug', 'month.sep': 'Sep',
      'month.oct': 'Oct', 'month.nov': 'Nov', 'month.dec': 'Dec',

      // themes (labels)
      'theme.personal-experiences': 'Personal Experiences',
      'theme.memories': 'Memories',
      'theme.family': 'Family',
      'theme.travel': 'Travel',
      'theme.nature': 'Nature',
      'theme.creativity': 'Creativity',
      'theme.fiction': 'Fiction',
      'theme.poetry': 'Poetry',
      'theme.relationships': 'Relationships',
      'theme.personal-growth': 'Personal Growth',
      'theme.gratitude': 'Gratitude',
      'theme.dreams': 'Dreams',
      'theme.goals': 'Goals',
      'theme.work': 'Work',
      'theme.ideas': 'Ideas',
      'theme.philosophy': 'Philosophy',
      'theme.everyday-life': 'Everyday Life',
      'theme.journaling': 'Journaling',
      'theme.storytelling': 'Storytelling',
      'theme.humor': 'Humor',
      'theme.mystery': 'Mystery',
      'theme.adventure': 'Adventure',
      'theme.science': 'Science',
      'theme.history': 'History',
      'theme.culture': 'Culture',
      'theme.food': 'Food',
      'theme.places': 'Places',
      'theme.people': 'People',
      'theme.surprise-me': 'Surprise Me',
    },
    es: {
      'brand.name': 'Contador de palabras',
      'header.history': 'Historial',
      'header.settings': 'Ajustes',
      'header.dashboard': 'Panel',
      'badge.pro': 'PRO',
      'nav.back': 'Volver',

      'session.eyebrowIdle': '¿Listo para escribir?',
      'session.eyebrowActive': 'Sesión de escritura',
      'session.eyebrowDone': 'Sesión completada',
      'session.words': 'palabras',
      'session.word': 'palabra',
      'session.wordsTyped': 'palabras escritas',
      'session.wordTyped': 'palabra escrita',
      'session.pastedSuffix': '+ {n} pegadas',
      'session.goalLabel': 'Meta: {n} palabras',
      'session.goalReached': 'Meta alcanzada',
      'session.duration': 'Duración de la sesión',
      'session.start': 'Empezar sesión',
      'session.stop': 'Terminar sesión',
      'session.new': 'Empezar nueva sesión',
      'session.helperIdle': 'Empieza una sesión y tus palabras se contarán mientras escribes.',
      'session.helperActive': 'Sigue escribiendo en cualquier parte de Chrome — la sesión continúa en segundo plano.',
      'session.helperDone': 'La sesión se guardó en este dispositivo. Empieza otra cuando quieras.',

      'paste.welcome': 'Bienvenido',
      'paste.question': '¿Cómo quieres contar el texto pegado?',
      'paste.helper': 'Puedes cambiar esto luego en los ajustes.',
      'paste.separateTitle': 'Contarlo aparte',
      'paste.separateSub': 'Sigue las palabras escritas y pegadas por separado.',
      'paste.astypedTitle': 'Contarlo como escrito',
      'paste.astypedSub': 'Combina todo en un solo total.',

      'upgrade.cta.title': 'Descubre tu progreso',
      'upgrade.cta.sub': 'Retos diarios, metas de escritura e historial de tu progreso.',
      'upgrade.cta.btn': 'Mejorar',

      'upgrade.headline': 'Escribe con propósito',
      'upgrade.sub': 'Convierte la escritura en un hábito visible.',
      'upgrade.free.title': 'Gratis',
      'upgrade.free.price': '$0',
      'upgrade.free.f1': 'Sesiones de escritura',
      'upgrade.free.f2': 'Contador de palabras en vivo',
      'upgrade.free.f3': 'Resumen de la sesión',
      'upgrade.pro.title': 'Pro',
      'upgrade.pro.price': '$4.99',
      'upgrade.pro.per': '/ mes',
      'upgrade.pro.f1': 'Todo lo de Gratis',
      'upgrade.pro.f2': 'Retos diarios personalizados',
      'upgrade.pro.f3': 'Temas de escritura',
      'upgrade.pro.f4': 'Metas por sesión',
      'upgrade.pro.f5': 'Historial y progreso',
      'upgrade.pro.f6': 'Inglés y español',
      'upgrade.tryPro': 'Probar Pro',
      'upgrade.demoNote': 'Modo demo — no se cobra nada. Puedes desactivarlo cuando quieras.',

      'onboard.step': 'Paso {n} de 4',
      'onboard.headline': 'Convierte la escritura en un hábito.',
      'onboard.sub': 'Elige cuánto te gustaría escribir y sobre qué te gustaría escribir.',
      'onboard.begin': 'Empezar',
      'onboard.language.title': 'Elige tu idioma',
      'onboard.language.sub': 'Puedes cambiarlo cuando quieras en Ajustes.',
      'onboard.goal.title': 'Elige la meta por sesión',
      'onboard.goal.question': '¿Cuántas palabras te gustaría escribir por sesión?',
      'onboard.goal.rule': 'La meta debe ser un múltiplo de 25.',
      'onboard.goal.invalid': 'Escribe una meta en múltiplos de 25 palabras.',
      'onboard.goal.suggest': 'Prueba con {a} o {b} palabras.',
      'onboard.themes.title': 'Elige temas de escritura',
      'onboard.themes.sub': 'Escoge algunos — tu reto diario saldrá de estos.',
      'onboard.themes.min': 'Elige al menos un tema.',
      'onboard.done.title': 'Todo listo.',
      'onboard.done.sub': 'Tu primer reto te está esperando dentro.',
      'onboard.finish': 'Entrar a Pro',
      'onboard.continue': 'Continuar',

      'prompt.today': 'El reto de hoy',
      'prompt.yourGoal': 'Tu meta: {n} palabras',
      'prompt.start': 'Empezar a escribir',
      'prompt.another': 'Otro reto',
      'prompt.themesEmpty': 'Elige tus temas para ver un reto.',
      'prompt.editThemes': 'Editar temas',

      'history.title': 'Sesiones recientes',
      'history.empty1': 'Tus sesiones aparecerán aquí.',
      'history.empty2': 'Guardadas solo en este dispositivo.',
      'history.today': 'Hoy',
      'history.yesterday': 'Ayer',
      'history.summary.none': 'Todavía no hay sesiones',
      'history.summary.saved': '{n} sesión guardada',
      'history.summary.savedPlural': '{n} sesiones guardadas',
      'history.summary.today': '{words} palabras hoy · {sessions} sesión',
      'history.summary.todayPlural': '{words} palabras hoy · {sessions} sesiones',
      'history.clear': 'Borrar historial',

      'settings.title': 'Ajustes',
      'settings.writing': 'Escritura',
      'settings.goalRow': 'Meta de palabras',
      'settings.goalMeta': '{n} palabras por sesión',
      'settings.themesRow': 'Temas de retos',
      'settings.themesMetaEmpty': 'Ninguno seleccionado',
      'settings.pasteRow': 'Texto pegado',
      'settings.pasteSeparate': 'Contarlo aparte',
      'settings.pasteAsTyped': 'Contarlo como escrito',
      'settings.appearance': 'Apariencia',
      'settings.language': 'Idioma',
      'settings.account': 'Cuenta',
      'settings.plan': 'Plan',
      'settings.planFree': 'Gratis',
      'settings.planPro': 'Pro (demo)',
      'settings.cancelPro': 'Desactivar Pro (demo)',
      'settings.upgradeRow': 'Mejorar a Pro',
      'settings.proBadge': 'PRO',
      'settings.privacy': 'Tu escritura nunca sale de este dispositivo.',
      'settings.edit': 'Editar',
      'settings.save': 'Guardar',
      'settings.themesSaveMin': 'Elige al menos un tema.',

      'dash.viewFull': 'Ver estadísticas',
      'dash.title': 'Tu escritura',
      'dash.tabs.today': 'Hoy',
      'dash.tabs.week': 'Esta semana',
      'dash.tabs.month': 'Este mes',
      'dash.tabs.year': 'Este año',
      'dash.tabs.all': 'Historial',
      'dash.primaryWords': '{n} palabras',
      'dash.primarySub.today': 'hoy',
      'dash.primarySub.week': 'esta semana',
      'dash.primarySub.month': 'este mes',
      'dash.primarySub.year': 'este año',
      'dash.primarySub.all': 'en total',
      'dash.goal': 'Meta',
      'dash.progress': 'Progreso',
      'dash.sessions': '{n} sesión',
      'dash.sessionsPlural': '{n} sesiones',
      'dash.recent': 'Sesiones recientes',
      'dash.noData': 'Aún no hay escritura registrada en este rango.',
      'dash.avgPerDay': 'Promedio diario',
      'dash.bestDay': 'Mejor día',
      'dash.longestSession': 'Sesión más larga',
      'dash.free.banner': 'Desbloquea este panel con Pro',
      'dash.free.bannerSub': 'Retos diarios, metas de escritura e historial de un vistazo.',
      'dash.free.upgrade': 'Mejorar',

      'day.mon': 'Lun', 'day.tue': 'Mar', 'day.wed': 'Mié', 'day.thu': 'Jue',
      'day.fri': 'Vie', 'day.sat': 'Sáb', 'day.sun': 'Dom',
      'month.jan': 'Ene', 'month.feb': 'Feb', 'month.mar': 'Mar',
      'month.apr': 'Abr', 'month.may': 'May', 'month.jun': 'Jun',
      'month.jul': 'Jul', 'month.aug': 'Ago', 'month.sep': 'Sep',
      'month.oct': 'Oct', 'month.nov': 'Nov', 'month.dec': 'Dic',

      'theme.personal-experiences': 'Experiencias personales',
      'theme.memories': 'Recuerdos',
      'theme.family': 'Familia',
      'theme.travel': 'Viajes',
      'theme.nature': 'Naturaleza',
      'theme.creativity': 'Creatividad',
      'theme.fiction': 'Ficción',
      'theme.poetry': 'Poesía',
      'theme.relationships': 'Relaciones',
      'theme.personal-growth': 'Crecimiento personal',
      'theme.gratitude': 'Gratitud',
      'theme.dreams': 'Sueños',
      'theme.goals': 'Metas',
      'theme.work': 'Trabajo',
      'theme.ideas': 'Ideas',
      'theme.philosophy': 'Filosofía',
      'theme.everyday-life': 'Vida cotidiana',
      'theme.journaling': 'Diario',
      'theme.storytelling': 'Narrativa',
      'theme.humor': 'Humor',
      'theme.mystery': 'Misterio',
      'theme.adventure': 'Aventura',
      'theme.science': 'Ciencia',
      'theme.history': 'Historia',
      'theme.culture': 'Cultura',
      'theme.food': 'Comida',
      'theme.places': 'Lugares',
      'theme.people': 'Personas',
      'theme.surprise-me': 'Sorpréndeme',
    },
  };

  let CURRENT = 'en';

  function detectDefault() {
    try {
      const nav = (navigator.language || 'en').toLowerCase();
      if (nav.startsWith('es')) return 'es';
    } catch (_) { /* ignore */ }
    return 'en';
  }

  function setLang(lang) {
    CURRENT = lang === 'es' ? 'es' : 'en';
  }
  function getLang() { return CURRENT; }
  function availableLangs() { return ['en', 'es']; }

  function t(key, vars) {
    const table = DICT[CURRENT] || DICT.en;
    let s = table[key];
    if (s == null) s = (DICT.en[key] != null ? DICT.en[key] : key);
    if (vars) {
      s = s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? String(vars[k]) : ''));
    }
    return s;
  }

  /**
   * Walk `root` and swap:
   *   - textContent of elements with data-i18n="key"
   *   - the placeholder of inputs with data-i18n-placeholder="key"
   *   - the aria-label of elements with data-i18n-aria="key"
   *   - the title of elements with data-i18n-title="key"
   */
  function applyI18n(root = document) {
    root.querySelectorAll('[data-i18n]').forEach((el) => {
      const key = el.getAttribute('data-i18n');
      el.textContent = t(key);
    });
    root.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
      el.setAttribute('placeholder', t(el.getAttribute('data-i18n-placeholder')));
    });
    root.querySelectorAll('[data-i18n-aria]').forEach((el) => {
      el.setAttribute('aria-label', t(el.getAttribute('data-i18n-aria')));
    });
    root.querySelectorAll('[data-i18n-title]').forEach((el) => {
      el.setAttribute('title', t(el.getAttribute('data-i18n-title')));
    });
  }

  scope.WCi18n = { t, setLang, getLang, availableLangs, detectDefault, applyI18n };
})(typeof window !== 'undefined' ? window : globalThis);
