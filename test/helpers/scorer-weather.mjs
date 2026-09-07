// CLI preload for deterministic scoring tests. Unexpected network access fails.
globalThis.fetch = async url => {
  const parsed = new URL(url);
  if (parsed.hostname !== 'analisi.transparenciacatalunya.cat') throw new Error('Unexpected test network request');
  if (parsed.pathname.endsWith('/yqwd-vj5e.json')) {
    return Response.json([{ codi_estacio: 'UI', nom_estacio: 'Fixture', latitud: 41.55, longitud: 1.8, altitud: 1000 }]);
  }
  if (!parsed.pathname.endsWith('/nzvn-apee.json')) throw new Error('Unexpected weather dataset');
  const values={ '35':12,'32':16,'33':70,'30':2,'36':180 };
  return Response.json(Object.keys(values).flatMap(variable=>Array.from({length:61},(_,index)=>{
      const date=new Date(Date.UTC(2026,8,5-index));
      const value=values[variable];
      return {
        codi_variable:variable,codi_estacio:'UI',dia:date.toISOString().slice(0,10),total:value,
        mean:value,min:variable==='32'?10:variable==='33'?45:value,
        max:variable==='32'?22:variable==='33'?95:value,n:48,
        latest:new Date(date.getTime()+23.5*60*60*1000).toISOString(),
      };
    })));
};
