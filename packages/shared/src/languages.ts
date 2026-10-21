/**
 * FreeLM — language registry.
 *
 * Mirrors the 80+ languages Google's Gemini Notebook supports for Audio
 * Overviews, Video Overviews, voice conversation and audio import.
 *
 * `bcp47` is the tag passed to TTS/STT providers. `edge` is the name used by
 * the Microsoft Edge TTS voice endpoint (free, no API key, 100+ voices).
 * `openai` is the OpenAI TTS voice.
 */

export interface Language {
  /** ISO 639-1 code. */
  code: string;
  /** Display name. */
  name: string;
  /** BCP-47 tag handed to TTS / STT providers. */
  bcp47: string;
  /** Microsoft Edge TTS voice name. */
  edge?: string;
  /** OpenAI TTS voice. */
  openai?: string;
  /** Gemini TTS voice name. */
  gemini?: string;
  /** Whether audio can be transcribed in this language. */
  transcription: boolean;
}

const L = (
  code: string,
  name: string,
  bcp47: string,
  edge: string | null | undefined,
  openai: string | null | undefined,
  gemini: string | null | undefined,
  transcription = true,
): Language => ({
  code,
  name,
  bcp47,
  ...(edge ? { edge } : {}),
  ...(openai ? { openai } : {}),
  ...(gemini ? { gemini } : {}),
  transcription,
});

export const LANGUAGES: readonly Language[] = [
  L('af', 'Afrikaans', 'af-ZA', 'af-ZA-WavenNeural', 'af', 'af-ZA'),
  L('sq', 'Albanian', 'sq-AL', 'sq-AL-AnaNeural', 'sq', 'sq-AL'),
  L('am', 'Amharic', 'am-ET', 'am-ET-AbeoNeural', 'am', 'am-ET'),
  L('ar-eg', 'Arabic (Colloquial Egyptian)', 'ar-EG', 'ar-EG-SalmaNeural', 'ar', 'ar-EG'),
  L('ar', 'Arabic (Modern Standard)', 'ar-SA', 'ar-SA-ZariyahNeural', 'ar', 'ar-SA'),
  L('hy', 'Armenian', 'hy-AM', 'hy-AM-AnahitNeural', 'hy', 'hy-AM'),
  L('az', 'Azerbaijani', 'az-AZ', 'az-AZ-NuranNeural', 'az', 'az-AZ'),
  L('eu', 'Basque', 'eu-ES', 'eu-ES-AneNeural', 'eu', 'eu-ES'),
  L('be', 'Belarusian', 'be-BY', 'be-BY-TatsianaNeural', 'be', 'be-BY'),
  L('bn', 'Bengali', 'bn-BD', 'bn-BD-JarulNeural', 'bn', 'bn-IN'),
  L('bg', 'Bulgarian', 'bg-BG', 'bg-BG-KalinaNeural', 'bg', 'bg-BG'),
  L('my', 'Burmese (Myanmar)', 'my-MM', 'my-MM-ThazinNeural', 'my', 'my-MM'),
  L('ca', 'Catalan', 'ca-ES', 'ca-ES-JoanaNeural', 'ca', 'ca-ES'),
  L('ceb', 'Cebuano', 'fil-PH', 'fil-PH-GiselleNeural', 'ce', 'fil-PH'),
  L('zh-hans', 'Chinese (Simplified)', 'zh-CN', 'zh-CN-XiaoxiaoNeural', 'zh', 'cmn-CN'),
  L('zh-hant', 'Chinese (Traditional)', 'zh-TW', 'zh-TW-HsiaoChenNeural', 'zh', 'yue-Hant-HK'),
  L('hr', 'Croatian', 'hr-HR', 'hr-HR-GabrijNeural', 'hr', 'hr-HR'),
  L('cs', 'Czech', 'cs-CZ', 'cs-CZ-VlastaNeural', 'cs', 'cs-CZ'),
  L('da', 'Danish', 'da-DK', 'da-DK-ChristelNeural', 'da', 'da-DK'),
  L('nl', 'Dutch', 'nl-NL', 'nl-NL-ColetteNeural', 'nl', 'nl-NL'),
  L('en', 'English', 'en-US', 'en-US-JennyNeural', 'en', 'en-US'),
  L('en-gb', 'English (UK)', 'en-GB', 'en-GB-SoniaNeural', 'en', 'en-GB'),
  L('en-ca', 'English (Canada)', 'en-CA', 'en-CA-ClaraNeural', 'en', 'en-CA'),
  L('et', 'Estonian', 'et-EE', 'et-EE-AnuNeural', 'et', 'et-EE'),
  L('fil', 'Filipino', 'fil-PH', 'fil-PH-GiselleNeural', 'fil', 'fil-PH'),
  L('fi', 'Finnish', 'fi-FI', 'fi-FI-NooraNeural', 'fi', 'fi-FI'),
  L('fr', 'French', 'fr-FR', 'fr-FR-DeniseNeural', 'fr', 'fr-FR'),
  L('fr-ca', 'French (Canada)', 'fr-CA', 'fr-CA-SylvieNeural', 'fr', 'fr-CA'),
  L('gl', 'Galician', 'gl-ES', 'gl-ES-IriaNeural', 'gl', 'gl-ES'),
  L('ka', 'Georgian', 'ka-GE', 'ka-GE-NatiaNeural', 'ka', 'ka-GE'),
  L('de', 'German', 'de-DE', 'de-DE-KatjaNeural', 'de', 'de-DE'),
  L('el', 'Greek', 'el-GR', 'el-GR-AthinaNeural', 'el', 'el-GR'),
  L('gu', 'Gujarati', 'gu-IN', 'gu-IN-DhwaniNeural', 'gu', 'gu-IN'),
  L('ht', 'Haitian Creole', 'ht-HT', 'ht-HT-SayanaNeural', null, 'ht-HT'),
  L('he', 'Hebrew', 'he-IL', 'he-IL-HilaNeural', 'he', 'he-IL'),
  L('hi', 'Hindi', 'hi-IN', 'hi-IN-SwaraNeural', 'hi', 'hi-IN'),
  L('hu', 'Hungarian', 'hu-HU', 'hu-HU-NoemiNeural', 'hu', 'hu-HU'),
  L('is', 'Icelandic', 'is-IS', 'is-IS-HuldaNeural', 'is', 'is-IS'),
  L('id', 'Indonesian', 'id-ID', 'id-ID-GadisNeural', 'id', 'id-ID'),
  L('it', 'Italian', 'it-IT', 'it-IT-ElsaNeural', 'it', 'it-IT'),
  L('ja', 'Japanese', 'ja-JP', 'ja-JP-NanamiNeural', 'ja', 'ja-JP'),
  L('jv', 'Javanese', 'jv-ID', 'jv-ID-ArdiNeural', 'jv', 'jv-ID'),
  L('kn', 'Kannada', 'kn-IN', 'kn-IN-ShwetaNeural', 'kn', 'kn-IN'),
  L('ko', 'Korean', 'ko-KR', 'ko-KR-SunHiNeural', 'ko', 'ko-KR'),
  L('lv', 'Latvian', 'lv-LV', 'lv-LV-EveritaNeural', 'lv', 'lv-LV'),
  L('lt', 'Lithuanian', 'lt-LT', 'lt-LT-DaivaNeural', 'lt', 'lt-LT'),
  L('mk', 'Macedonian', 'mk-MK', 'mk-MK-MarijaNeural', 'mk', 'mk-MK'),
  L('ms', 'Malay', 'ms-MY', 'ms-MY-YasminNeural', 'ms', 'ms-MY'),
  L('ml', 'Malayalam', 'ml-IN', 'ml-IN-SreeNeural', 'ml', 'ml-IN'),
  L('mr', 'Marathi', 'mr-IN', 'mr-IN-AaravNeural', 'mr', 'mr-IN'),
  L('ne', 'Nepali', 'ne-NP', 'ne-NP-SagarNeural', 'ne', 'ne-NP'),
  L('nb', 'Norwegian (Bokmål)', 'nb-NO', 'nb-NO-LivNeural', 'nb', 'nb-NO'),
  L('nn', 'Norwegian (Nynorsk)', 'nn-NO', 'nn-NO-LivNeural', 'no', 'nn-NO'),
  L('or', 'Oriya', 'or-IN', 'or-IN-SubhasreeNeural', null, 'or-IN'),
  L('ps', 'Pashto', 'ps-AF', 'ps-AF-GulNeural', null, 'ps-AF'),
  L('fa', 'Persian', 'fa-IR', 'fa-IR-DilaraNeural', 'fa', 'fa-IR'),
  L('pl', 'Polish', 'pl-PL', 'pl-PL-ZofiaNeural', 'pl', 'pl-PL'),
  L('pt', 'Portuguese (Brazil)', 'pt-BR', 'pt-BR-FranciscaNeural', 'pt', 'pt-BR'),
  L('pt-pt', 'Portuguese (Portugal)', 'pt-PT', 'pt-PT-RaquelNeural', 'pt', 'pt-PT'),
  L('pa', 'Punjabi', 'pa-IN', 'pa-IN-NancyNeural', null, 'pa-IN'),
  L('ro', 'Romanian', 'ro-RO', 'ro-RO-CristinaNeural', 'ro', 'ro-RO'),
  L('ru', 'Russian', 'ru-RU', 'ru-RU-SvetlanaNeural', 'ru', 'ru-RU'),
  L('sr', 'Serbian (Cyrillic)', 'sr-RS', 'sr-RS-SophieNeural', 'sr', 'sr-RS'),
  L('sk', 'Slovak', 'sk-SK', 'sk-SK-LukasNeural', 'sk', 'sk-SK'),
  L('sl', 'Slovenian', 'sl-SI', 'sl-SI-VesnaNeural', 'sl', 'sl-SI'),
  L('es', 'Spanish', 'es-ES', 'es-ES-ElviraNeural', 'es', 'es-ES'),
  L('es-mx', 'Spanish (Mexico)', 'es-MX', 'es-MX-DaliaNeural', 'es', 'es-MX'),
  L('es-419', 'Spanish (Latin America)', 'es-419', 'es-419-XimenaNeural', 'es', 'es-419'),
  L('sw', 'Swahili', 'sw-KE', 'sw-KE-ZuriNeural', 'sw', 'sw-KE'),
  L('sv', 'Swedish', 'sv-SE', 'sv-SE-SofieNeural', 'sv', 'sv-SE'),
  L('tl', 'Tagalog', 'tl-PH', 'tl-PH-GraceNeural', null, 'fil-PH'),
  L('ta', 'Tamil', 'ta-IN', 'ta-IN-PallaviNeural', 'ta', 'ta-IN'),
  L('te', 'Telugu', 'te-IN', 'te-IN-VaniNeural', 'te', 'te-IN'),
  L('th', 'Thai', 'th-TH', 'th-TH-PremwadeeNeural', 'th', 'th-TH'),
  L('tr', 'Turkish', 'tr-TR', 'tr-TR-EmelNeural', 'tr', 'tr-TR'),
  L('uk', 'Ukrainian', 'uk-UA', 'uk-UA-PolinaNeural', 'uk', 'uk-UA'),
  L('ur', 'Urdu', 'ur-PK', 'ur-PK-UzmaNeural', 'ur', 'ur-PK'),
  L('uz', 'Uzbek', 'uz-UZ', 'uz-UZ-NoraNeural', 'uz', 'uz-UZ'),
  L('vi', 'Vietnamese', 'vi-VN', 'vi-VN-HoaiMyNeural', 'vi', 'vi-VN'),
];

export const DEFAULT_LANGUAGE = 'en';

export function getLanguage(code: string): Language {
  return (
    LANGUAGES.find((l) => l.code === code) ??
    LANGUAGES.find((l) => l.code.startsWith(code.split('-')[0] ?? code)) ??
    (LANGUAGES[0] as Language)
  );
}

export function languageName(code: string): string {
  return getLanguage(code).name;
}

/** Two distinct voices for the two-host Audio Overview. */
export function hostVoices(languageCode: string): { hostA: string; hostB: string } {
  const lang = getLanguage(languageCode);
  if (lang.edge) {
    // Edge TTS publishes gendered pairs; the two hosts use one of each.
    const female = lang.edge.replace(/-Neural$/, 'Neural');
    const male = `${lang.edge.split('-').slice(0, 2).join('-')}-GuyNeural`;
    return { hostA: female, hostB: male };
  }
  return { hostA: 'alloy', hostB: 'onyx' };
}
