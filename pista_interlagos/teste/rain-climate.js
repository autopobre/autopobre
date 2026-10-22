// The rain where each circuit is (Central #10, weather.js rainOdds): monthly means, January to December, of the
// days with at least 1 mm of rain (rainDays) and with at least 10 mm (heavyDays: chuva forte), from the nearest
// station with a climate normal. INMET Normais Climatológicas do Brasil 1991-2020 (1981-2010 where the station has
// no newer one: Santa Cruz; Cuiabá's and Florianópolis' day counts; Chapecó's March and June); Cascavel: IDR-Paraná
// station 02453023, its days counted on ANA HidroWeb's daily series 1973-1998; Piracicaba: ESALQ/USP's station,
// days counted on its daily series 1991-2020. Credits in sobre.html.
export const RAIN_CLIMATE=Object.freeze({
 interlagos:Object.freeze({station:'São Paulo · Mirante de Santana (INMET 83781)',period:'1991-2020',rainDays:[17,14,13,6,6,5,4,4,7,10,11,13],heavyDays:[9,8,7,3,2,2,2,1,3,4,5,7]}),
 minhocao:Object.freeze({station:'São Paulo · Mirante de Santana (INMET 83781)',period:'1991-2020',rainDays:[17,14,13,6,6,5,4,4,7,10,11,13],heavyDays:[9,8,7,3,2,2,2,1,3,4,5,7]}),
 cascavel:Object.freeze({station:'Cascavel · IDR-Paraná 02453023 (dias contados na série diária da ANA)',period:'1973-1998',rainDays:[12,11.3,10.2,8.7,9.5,8.7,6.8,6.5,8.5,11.2,9.8,11],heavyDays:[5.4,5.4,4.3,4.7,5.1,4.2,3.4,3.3,4.8,6.6,5.9,5.7]}),
 piracicaba:Object.freeze({station:'Piracicaba · ESALQ/USP (dias contados na série diária)',period:'1991-2020',rainDays:[15.5,12.4,10.4,4.9,5.2,3.8,3.1,3,5.7,9,10,13.2],heavyDays:[7.9,5.8,5.1,2.3,2.1,1.6,1,1,2.4,4.1,4.8,6.1]}),
 chapeco:Object.freeze({station:'Chapecó (INMET 83883)',period:'1991-2020 (Mar,Jun from 1981-2010)',rainDays:[12,11,9,9,8,9,8,7,10,12,9,10],heavyDays:[6,6,4,4,4,5,5,4,6,8,5,6]}),
 brasilia:Object.freeze({station:'Brasília (INMET 83377)',period:'1991-2020',rainDays:[16,14,15,9,3,1,0,2,4,10,17,18],heavyDays:[7,6,7,5,1,0,0,1,1,4,8,8]}),
 goiania:Object.freeze({station:'Goiânia (INMET 83423)',period:'1991-2020',rainDays:[17,16,17,9,3,1,0,1,4,11,16,18],heavyDays:[8,8,8,4,1,0,0,0,1,5,7,9]}),
 guaratiba:Object.freeze({station:'Rio de Janeiro · Santa Cruz (INMET 83789)',period:'1981-2010',rainDays:[11,8,9,7,7,5,6,6,8,8,9,11],heavyDays:[4,3,4,3,2,2,2,1,3,2,3,4]}),
 chapada:Object.freeze({station:'Cuiabá (INMET 83361), abaixo do planalto',period:'1981-2010',rainDays:[17,14,15,10,4,1,1,2,4,8,11,15],heavyDays:[7,7,6,3,1,1,0,1,2,3,5,6]}),
 floripa:Object.freeze({station:'Florianópolis · São José (INMET 83897)',period:'1981-2010',rainDays:[16,15,14,9,9,7,9,7,11,13,13,12],heavyDays:[8,6,5,4,4,3,4,3,5,5,5,4]}),
 pampulha:Object.freeze({station:'Belo Horizonte (INMET 83587)',period:'1991-2020',rainDays:[15,10,11,7,3,1,1,1,4,8,14,17],heavyDays:[9,6,6,3,1,0,0,0,2,4,8,10]}),
 curvelo:Object.freeze({station:'Curvelo (INMET 83536)',period:'1991-2020',rainDays:[13,9,9,4,2,1,1,1,3,6,13,15],heavyDays:[7,4,5,1,1,0,0,0,1,3,6,8]})
});
