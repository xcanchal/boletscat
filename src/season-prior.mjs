const MONTHS_PER_YEAR = 12;

/**
 * Prior estacional suau, en substitució de la porta dura que multiplicava per
 * zero tot el que quedava a dos mesos o més de la temporada típica.
 *
 * La porta barrejava dues preguntes diferents: si les condicions d'avui són
 * bones i si l'espècie pot fructificar en aquesta època de l'any. Per això
 * deixava fora un cep d'agost, que és perfectament possible amb pluja, i en
 * treure-la res no impedia una múrgola de setembre, que no ho és: la Morchella
 * respon a l'escalfament del sòl després de l'hivern, no a la pluja de tardor.
 *
 * `spread` és l'amplada de la caiguda en mesos i separa els dos casos: ample
 * per a les espècies oportunistes, estret per a les que depenen d'un senyal
 * estacional concret.
 */
export function seasonPrior(month, months, spread) {
  if (!Number.isInteger(month) || month < 1 || month > MONTHS_PER_YEAR) {
    throw new TypeError(`Mes fora de rang: ${month}`);
  }
  if (!Array.isArray(months) || !months.length) {
    throw new TypeError("La temporada típica no pot ser buida");
  }
  if (!(spread > 0)) {
    throw new TypeError(`Amplada estacional invàlida: ${spread}`);
  }

  const distance = Math.min(...months.map((typical) => {
    const gap = Math.abs(typical - month);
    return Math.min(gap, MONTHS_PER_YEAR - gap);
  }));
  return Math.exp(-(distance ** 2) / (2 * spread ** 2));
}
