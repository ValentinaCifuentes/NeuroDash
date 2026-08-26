const numberWords: Record<number, string> = {
  0: "cero",
  1: "uno",
  2: "dos",
  3: "tres",
  4: "cuatro",
  5: "cinco",
  6: "seis",
  7: "siete",
  8: "ocho",
  9: "nueve",
  10: "diez",
  11: "once",
  12: "doce",
  13: "trece",
  14: "catorce",
  15: "quince",
  16: "dieciseis",
  17: "diecisiete",
  18: "dieciocho",
  19: "diecinueve",
  20: "veinte",
  21: "veintiuno",
  22: "veintidos",
  23: "veintitres",
  24: "veinticuatro",
  25: "veinticinco",
  26: "veintiseis",
  27: "veintisiete",
  28: "veintiocho",
  29: "veintinueve",
  30: "treinta",
};

const translations: Record<string, string> = {
  "ELEVATED": "ELEVADO",
  "HIGH": "ALTO",
  "STANDARD": "ESTANDAR",
  "MEDIUM": "MEDIO",
  "LOW": "BAJO",
  "INSUFFICIENT": "INSUFICIENTE",
  "ABSTAINED": "SIN PREDICCION",
  "Sleep duration change": "Cambio en la duracion del sueno",
  "Sensory environment noise": "Ruido del entorno sensorial",
  "Ambient lighting change": "Cambio en la iluminacion ambiental",
  "Visual Schedule": "Horario visual",
  "Structured visual representation of daily flow": "Representacion visual estructurada de la rutina diaria",
  "Shorter sleep duration observed over prior 3 days": "Se observo menor duracion del sueno durante los tres dias previos",
  "Increased ambient decibel readings": "Aumento en las lecturas de decibeles ambientales",
  "Reduced brightness": "Brillo reducido",
  "Missing sleep data for prior 3 nights": "Faltan datos de sueno de las tres noches previas",
  "No evidence-based supports available.": "No hay apoyos basados en evidencia disponibles.",
  "Weighted blanket in evening.": "Manta con peso por la noche.",
  "Scheduled noise-reducing breaks.": "Pausas programadas para reducir ruido.",
  "Weighted blanket used successfully.": "Manta con peso usada con exito.",
  "Reduce ambient lighting and noise in the evening.": "Reducir la iluminacion ambiental y el ruido por la noche.",
  "Engage in calm stretching before bedtime.": "Realizar estiramientos tranquilos antes de dormir.",
  "Maintain a regular sleep schedule.": "Mantener un horario de sueno regular.",
};

export const numberToSpanishWords = (value: number): string => {
  if (Number.isInteger(value) && value in numberWords) {
    return numberWords[value];
  }

  return String(value);
};

export const translateDisplayText = (value: unknown): string => {
  if (value === null || value === undefined) {
    return "N/D";
  }

  const text = String(value);
  const exact = translations[text];
  if (exact) {
    return exact;
  }

  return text
    .replace(/Recent /g, "Reciente ")
    .replace(/ is associated with an increase in observed patterns\./g, " se asocia con un aumento en los patrones observados.")
    .replace(/ is associated with a decrease in observed patterns\./g, " se asocia con una disminucion en los patrones observados.")
    .replace(/ shows no active association with observed patterns\./g, " no muestra una asociacion activa con los patrones observados.")
    .replace(/Sleep Quality In The Last (\d+) Days/g, (_, days) => `Calidad del sueno en los ultimos ${numberToSpanishWords(Number(days))} dias`)
    .replace(/Wake State In The Last (\d+) Days/g, (_, days) => `Estado al despertar en los ultimos ${numberToSpanishWords(Number(days))} dias`)
    .replace(/(\d+) days?/gi, (_, days) => `${numberToSpanishWords(Number(days))} dias`)
    .replace(/(\d+) nights?/gi, (_, nights) => `${numberToSpanishWords(Number(nights))} noches`);
};
