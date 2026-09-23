/**
 * Word Count — Static prompt library (English + Spanish)
 *
 * Themes match `theme.<slug>` keys in i18n.js. Each theme has 3-5 prompts
 * per language. `Surprise Me` is a virtual theme that pulls from all
 * available prompts.
 *
 * Selection rules (implemented in background.js):
 *   1. Build the candidate pool from the user's currently selected
 *      themes (or every prompt if 'surprise-me' is chosen).
 *   2. Exclude any prompt id in `wc_prompt_state.history` (last 10).
 *   3. Pick uniformly at random.
 *   4. Store `{ date, promptId, theme, language, history }` so opening
 *      the popup again the same day returns the same prompt.
 */
(function attach(scope) {
  const PROMPTS = {
    en: {
      'personal-experiences': [
        'Describe a moment when you felt fully alive.',
        'Write about a small decision that changed your life.',
        'What is a lesson you learned the hard way?',
        'Describe a day you would happily live again.',
      ],
      'memories': [
        'Describe a place from your childhood in vivid detail.',
        'Write about a smell that instantly transports you back in time.',
        'What memory feels almost like a dream now?',
        'Write about a photograph you can picture without seeing it.',
      ],
      'family': [
        'Write a portrait of one of your grandparents.',
        'Describe a family tradition and what it means to you.',
        'Write about a conversation you wish you could have again.',
        'What would you like your family to remember about you?',
      ],
      'travel': [
        'Describe a place that surprised you.',
        'Write about a stranger you met while traveling.',
        'What did a journey teach you about home?',
        'Describe a landscape that made you feel small in a good way.',
      ],
      'nature': [
        'Describe a walk you took at dawn.',
        'Write about a plant or animal you feel connected to.',
        'What does the weather feel like where you are today?',
        'Describe the sky in one long, unbroken sentence.',
      ],
      'creativity': [
        'What are you working on that you want to nurture?',
        'Describe a creative block and how you moved through it.',
        'Write about the last thing you made that surprised you.',
        'What would you make if no one would ever see it?',
      ],
      'fiction': [
        'A character finds a letter addressed to them in handwriting they recognize.',
        'Two strangers are stuck in an elevator together for exactly one hour.',
        'Write the opening scene of a story set in a place that no longer exists.',
        'Someone receives a gift they never asked for and cannot return.',
      ],
      'poetry': [
        'Write a short poem about waiting.',
        'Describe a color as if it were a person.',
        'Write a poem in which every line begins with "I remember".',
        'Write about silence without using the word.',
      ],
      'relationships': [
        'Write about a friendship that shaped you.',
        'Describe a conversation you keep replaying.',
        'What do you wish you could say to someone right now?',
        'Write about a person you would like to know better.',
      ],
      'personal-growth': [
        'What is one thing you believe now that you did not five years ago?',
        'Describe a habit that is quietly reshaping your life.',
        'Write about a fear you are learning to sit with.',
        'What would you tell yourself one year from today?',
      ],
      'gratitude': [
        'List ten small things you are grateful for right now.',
        'Write about someone whose kindness stayed with you.',
        'Describe a moment today that you almost missed.',
        'What is a hard thing you are grateful for?',
      ],
      'dreams': [
        'Describe a dream you can still remember years later.',
        'Write about a place that only exists in your imagination.',
        'What did your childhood self hope you would become?',
        'Write about a dream you have not yet started chasing.',
      ],
      'goals': [
        'What is a goal you have been quietly carrying?',
        'Describe the smallest possible first step you could take today.',
        'Write about what "finished" would look and feel like.',
        'What is a goal you have outgrown?',
      ],
      'work': [
        'Describe a task at work that you find surprisingly satisfying.',
        'Write about a colleague who taught you something.',
        'What kind of work do you want to be doing in five years?',
        'Describe a project you are proud of, in detail.',
      ],
      'ideas': [
        'Write about an idea you cannot stop thinking about.',
        'Describe an idea from a book that changed how you see the world.',
        'What is a small idea that could become a big one?',
        'Write about an idea you disagree with — steelman it first.',
      ],
      'philosophy': [
        'What does a good life look like to you today?',
        'Write about the difference between being alone and being lonely.',
        'What is a question you keep returning to?',
        'Describe something you believe most people misunderstand.',
      ],
      'everyday-life': [
        'Write about your morning routine as if you were describing it to a stranger.',
        'Describe the quietest moment of your day yesterday.',
        'What did you notice on your way somewhere today?',
        'Write about a small ritual that anchors your week.',
      ],
      'journaling': [
        'What is on your mind that you have not written down?',
        'Describe today in one paragraph, honestly.',
        'Write about how you are actually doing, not how you say you are.',
        'What would you like to remember about this week?',
      ],
      'storytelling': [
        'Tell a short story that begins with a lost key.',
        'Write a scene without any dialogue.',
        'Describe a moment from a stranger\'s point of view.',
        'Write a story that takes place entirely inside a single room.',
      ],
      'humor': [
        'Write about the most embarrassing thing you have laughed about later.',
        'Describe a small absurdity in your daily life.',
        'Write instructions for something simple, in the most complicated way possible.',
        'Turn a minor inconvenience into an epic saga.',
      ],
      'mystery': [
        'A note is slipped under your door with a single sentence on it.',
        'Someone in your neighborhood has been leaving strange objects on doorsteps.',
        'Describe an unsolved question from your own life.',
        'Write about a place that feels like it has a secret.',
      ],
      'adventure': [
        'Describe the last time you did something for the first time.',
        'Write about a plan that went beautifully wrong.',
        'What would a small adventure look like today?',
        'Describe a journey you would like to take alone.',
      ],
      'science': [
        'Write about a scientific idea that changed how you see the everyday.',
        'Describe a natural phenomenon in the plainest words you can.',
        'What is a question about the world you wish you could answer?',
        'Write about a technology you both love and mistrust.',
      ],
      'history': [
        'Describe a moment in history you would like to have witnessed.',
        'Write about an object in your home that has a history.',
        'What is a lesson from the past that your present needs?',
        'Imagine a letter to someone living 100 years ago.',
      ],
      'culture': [
        'Describe a song, book, or film that shaped you.',
        'Write about a cultural moment that felt like a turning point.',
        'What do you find beautiful about a culture that is not your own?',
        'Describe a tradition you would like to invent.',
      ],
      'food': [
        'Describe a meal you would happily eat every day.',
        'Write about a dish that reminds you of a specific person.',
        'Describe cooking something you have made a hundred times.',
        'What food do you associate with feeling safe?',
      ],
      'places': [
        'Describe your favorite room in the world.',
        'Write about a place you have never been but often imagine.',
        'What does home mean to you right now?',
        'Describe a city as if it were a person you know.',
      ],
      'people': [
        'Write a portrait of someone you saw briefly today.',
        'Describe a person who quietly influenced your life.',
        'Write about a stranger who felt oddly familiar.',
        'Who is a person you would like to write a letter to?',
      ],
    },
    es: {
      'personal-experiences': [
        'Describe un momento en el que te sentiste plenamente vivo.',
        'Escribe sobre una decisión pequeña que cambió tu vida.',
        '¿Cuál es una lección que aprendiste por las malas?',
        'Describe un día que volverías a vivir con gusto.',
      ],
      'memories': [
        'Describe con detalle un lugar de tu infancia.',
        'Escribe sobre un olor que te transporta al pasado.',
        '¿Qué recuerdo hoy parece casi un sueño?',
        'Escribe sobre una fotografía que puedes imaginar sin verla.',
      ],
      'family': [
        'Retrata a uno de tus abuelos.',
        'Describe una tradición familiar y lo que significa para ti.',
        'Escribe sobre una conversación que quisieras tener otra vez.',
        '¿Qué te gustaría que tu familia recordara de ti?',
      ],
      'travel': [
        'Describe un lugar que te sorprendió.',
        'Escribe sobre un desconocido que conociste viajando.',
        '¿Qué te enseñó un viaje sobre tu casa?',
        'Describe un paisaje que te hizo sentir pequeño de una manera buena.',
      ],
      'nature': [
        'Describe una caminata al amanecer.',
        'Escribe sobre una planta o animal con el que te sientes conectado.',
        '¿Cómo se siente el clima donde estás hoy?',
        'Describe el cielo en una sola oración larga.',
      ],
      'creativity': [
        '¿En qué proyecto estás trabajando que quieres cuidar?',
        'Describe un bloqueo creativo y cómo lo atravesaste.',
        'Escribe sobre la última cosa que hiciste que te sorprendió.',
        '¿Qué crearías si nadie fuera a verlo nunca?',
      ],
      'fiction': [
        'Un personaje encuentra una carta con una letra que reconoce.',
        'Dos desconocidos quedan atrapados una hora en un ascensor.',
        'Escribe la escena inicial de una historia en un lugar que ya no existe.',
        'Alguien recibe un regalo que no pidió y no puede devolver.',
      ],
      'poetry': [
        'Escribe un poema corto sobre la espera.',
        'Describe un color como si fuera una persona.',
        'Escribe un poema donde cada verso empiece con "Recuerdo".',
        'Escribe sobre el silencio sin usar la palabra.',
      ],
      'relationships': [
        'Escribe sobre una amistad que te formó.',
        'Describe una conversación que sigues repitiendo en tu cabeza.',
        '¿Qué te gustaría decirle a alguien ahora mismo?',
        'Escribe sobre una persona a la que te gustaría conocer mejor.',
      ],
      'personal-growth': [
        '¿Qué crees hoy que no creías hace cinco años?',
        'Describe un hábito que está rehaciendo tu vida en silencio.',
        'Escribe sobre un miedo con el que estás aprendiendo a convivir.',
        '¿Qué le dirías a tu yo de dentro de un año?',
      ],
      'gratitude': [
        'Enumera diez pequeñas cosas por las que estás agradecido ahora.',
        'Escribe sobre alguien cuya bondad se quedó contigo.',
        'Describe un momento de hoy que casi se te escapa.',
        '¿Qué cosa difícil agradeces?',
      ],
      'dreams': [
        'Describe un sueño que aún recuerdas años después.',
        'Escribe sobre un lugar que solo existe en tu imaginación.',
        '¿Qué esperaba tu yo de niño que llegaras a ser?',
        'Escribe sobre un sueño que aún no empiezas a perseguir.',
      ],
      'goals': [
        '¿Qué meta llevas contigo en silencio?',
        'Describe el paso más pequeño que podrías dar hoy.',
        'Escribe cómo se vería y se sentiría "terminar".',
        '¿Qué meta ya no te queda?',
      ],
      'work': [
        'Describe una tarea del trabajo que te resulta curiosamente satisfactoria.',
        'Escribe sobre un colega que te enseñó algo.',
        '¿Qué tipo de trabajo quieres estar haciendo en cinco años?',
        'Describe con detalle un proyecto del que estás orgulloso.',
      ],
      'ideas': [
        'Escribe sobre una idea en la que no puedes dejar de pensar.',
        'Describe una idea de un libro que cambió tu manera de ver el mundo.',
        '¿Qué idea pequeña podría volverse grande?',
        'Escribe sobre una idea con la que no estás de acuerdo — defiéndela primero.',
      ],
      'philosophy': [
        '¿Cómo se ve hoy una vida buena para ti?',
        'Escribe sobre la diferencia entre estar solo y sentirse solo.',
        '¿Qué pregunta te sigue rondando?',
        'Describe algo que creas que la mayoría entiende mal.',
      ],
      'everyday-life': [
        'Describe tu rutina de mañana como se la contarías a un extraño.',
        'Cuenta el momento más silencioso de tu día de ayer.',
        '¿Qué notaste hoy camino a algún sitio?',
        'Escribe sobre un pequeño ritual que ancla tu semana.',
      ],
      'journaling': [
        '¿Qué tienes en la cabeza que aún no has escrito?',
        'Describe hoy en un párrafo, con honestidad.',
        'Escribe cómo estás de verdad, no cómo dices que estás.',
        '¿Qué te gustaría recordar de esta semana?',
      ],
      'storytelling': [
        'Cuenta una historia corta que empiece con una llave perdida.',
        'Escribe una escena sin diálogo.',
        'Describe un momento desde el punto de vista de un extraño.',
        'Escribe una historia que ocurra por completo dentro de una habitación.',
      ],
      'humor': [
        'Escribe sobre lo más vergonzoso de lo que ahora te ríes.',
        'Describe una pequeña absurdidad de tu día a día.',
        'Escribe instrucciones para algo simple de la forma más complicada posible.',
        'Convierte un inconveniente menor en una saga épica.',
      ],
      'mystery': [
        'Alguien desliza una nota bajo tu puerta con una sola frase.',
        'Alguien en tu barrio deja objetos extraños en las puertas.',
        'Describe una pregunta sin resolver de tu propia vida.',
        'Escribe sobre un lugar que parece guardar un secreto.',
      ],
      'adventure': [
        'Cuenta la última vez que hiciste algo por primera vez.',
        'Escribe sobre un plan que salió bellamente mal.',
        '¿Cómo sería una pequeña aventura hoy?',
        'Describe un viaje que te gustaría hacer solo.',
      ],
      'science': [
        'Escribe sobre una idea científica que te cambió lo cotidiano.',
        'Describe un fenómeno natural con las palabras más simples posibles.',
        '¿Qué pregunta sobre el mundo te gustaría responder?',
        'Escribe sobre una tecnología que amas y desconfías a la vez.',
      ],
      'history': [
        'Describe un momento histórico que te habría gustado presenciar.',
        'Escribe sobre un objeto de tu casa que tiene historia.',
        '¿Qué lección del pasado necesita tu presente?',
        'Imagina una carta a alguien que vivió hace 100 años.',
      ],
      'culture': [
        'Describe una canción, libro o película que te formó.',
        'Escribe sobre un momento cultural que sentiste como un giro.',
        '¿Qué te resulta bello de una cultura ajena?',
        'Describe una tradición que te gustaría inventar.',
      ],
      'food': [
        'Describe una comida que comerías con gusto todos los días.',
        'Escribe sobre un plato que te recuerda a una persona.',
        'Describe cómo cocinas algo que has hecho cien veces.',
        '¿Con qué comida asocias la sensación de seguridad?',
      ],
      'places': [
        'Describe tu habitación favorita del mundo.',
        'Escribe sobre un lugar donde no has estado pero imaginas seguido.',
        '¿Qué significa "casa" para ti ahora mismo?',
        'Describe una ciudad como si fuera una persona que conoces.',
      ],
      'people': [
        'Retrata a alguien que viste brevemente hoy.',
        'Describe a una persona que influyó en tu vida en silencio.',
        'Escribe sobre un desconocido que te resultó familiar.',
        '¿A qué persona te gustaría escribirle una carta?',
      ],
    },
  };

  // All theme slugs, in the order shown in the UI.
  const ALL_THEMES = [
    'personal-experiences','memories','family','travel','nature',
    'creativity','fiction','poetry','relationships','personal-growth',
    'gratitude','dreams','goals','work','ideas','philosophy',
    'everyday-life','journaling','storytelling','humor','mystery',
    'adventure','science','history','culture','food','places','people',
    'surprise-me',
  ];

  /**
   * Build the candidate pool of `{ id, text, theme }` for the user's
   * currently selected themes in the current language. 'surprise-me'
   * expands to every theme.
   */
  function buildPool(themes, lang) {
    const bank = PROMPTS[lang] || PROMPTS.en;
    const effective = (!themes || themes.length === 0 || themes.includes('surprise-me'))
      ? Object.keys(bank)
      : themes.filter((t) => bank[t]);
    const pool = [];
    effective.forEach((theme) => {
      (bank[theme] || []).forEach((text, i) => {
        pool.push({ id: `${lang}:${theme}:${i}`, text, theme });
      });
    });
    return pool;
  }

  /**
   * Pick a prompt avoiding recent history. Returns null if pool is empty.
   */
  function pickPrompt(themes, lang, historyIds = []) {
    const pool = buildPool(themes, lang);
    if (pool.length === 0) return null;
    const set = new Set(historyIds);
    let candidates = pool.filter((p) => !set.has(p.id));
    if (candidates.length === 0) candidates = pool; // history covered everything → reset
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  scope.WCPrompts = { ALL_THEMES, PROMPTS, buildPool, pickPrompt };
})(typeof window !== 'undefined' ? window : globalThis);
