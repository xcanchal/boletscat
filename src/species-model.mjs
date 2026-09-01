// Priors ecològics del predictor. Els quatre valors de `alt` i `temp` formen
// un trapezi [mínim, inici òptim, final òptim, màxim]: fora dels extrems el
// factor és 0 i entre l'òptim i els extrems decau progressivament.
//
// L'altitud és un prior suau, no una frontera exacta. Totes les espècies
// comparteixen una cua de 700 m per sobre del seu òptim; així les altres
// condicions encara poden compensar parcialment l'alta muntanya.
export const ALTITUDE_UPPER_FADE_M = 700;
const altitudeBand = (minimum, idealMinimum, idealMaximum) => [
  minimum,
  idealMinimum,
  idealMaximum,
  idealMaximum + ALTITUDE_UPPER_FADE_M,
];

export const SPECIES = {
  rovello:   { nom: "Rovelló / pinetell",               mesos:[9,10,11],    host:["conifer"], trend:"cooling",
               alt:altitudeBand(0,200,1500),   temp:[2,8,20,26] },
  cep:       { nom: "Cep (grup Boletus edulis)",        mesos:[6,9,10,11],  host:["conifer","deciduous","sclerophyll"], trend:"cooling",
               substrate:["siliceous"], alt:altitudeBand(400,800,1600), temp:[2,8,18,24] },
  llenega:   { nom: "Llenega negra (Hygrophorus latitabundus)", mesos:[10,11,12], host:["conifer"], trend:"cooling",
               substrate:["calcareous"], alt:altitudeBand(100,300,1300), temp:[0,4,14,20] },
  trompeta:  { nom: "Trompeta de la mort (Craterellus)",mesos:[9,10,11],    host:["deciduous","sclerophyll"], trend:"cooling",
               alt:altitudeBand(200,400,1300), temp:[2,8,18,24] },
  rossinyol: { nom: "Rossinyol (Cantharellus cibarius)",mesos:[6,7,8,9,10], host:["conifer","deciduous","sclerophyll"], trend:"neutral",
               substrate:["siliceous"], alt:altitudeBand(200,400,1500), temp:[4,10,22,28] },
  camagroc:  { nom: "Camagroc (Cantharellus lutescens)",mesos:[10,11,12,1], host:["conifer"], trend:"cooling",
               substrate:["calcareous"], alt:altitudeBand(300,500,1500), temp:[-2,2,14,20] },
  murgola:   { nom: "Múrgola (Morchella)",              mesos:[3,4,5],      host:["ribera","deciduous"], trend:"warming",
               alt:altitudeBand(100,300,1200), temp:[2,8,18,24] },
  ou_de_reig:{ nom: "Ou de reig (Amanita caesarea)",    mesos:[7,8,9,10],   host:["deciduous","sclerophyll"], trend:"neutral",
               substrate:["siliceous"], alt:altitudeBand(0,100,1400), temp:[8,14,28,32] },
  fredolic:  { nom: "Fredolic (Tricholoma terreum)",     mesos:[1,10,11,12], host:["conifer"], trend:"cooling",
               substrate:["calcareous"], alt:altitudeBand(0,100,1500), temp:[-5,0,12,18] },
};

export function trapezoid(x, a, b, c, d) {
  if (x == null || Number.isNaN(x)) return 0.5;
  if (x <= a || x >= d) return 0;
  if (x < b) return (x - a) / (b - a);
  if (x <= c) return 1;
  return (d - x) / (d - c);
}
