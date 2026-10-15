import * as THREE from 'three';

// The city map of a circuit in a real city (data.scenery.city.map, Floripa, scripts/circuitos/gerar_cidade_floripa.py): one
// image over the terrain grid at 1 m a pixel holding two maps, one above the other (map.rows rows each, map.gap rows
// between them); each channel the signed distance (metres, negative inside, ±range) to the edge of one kind of ground:
// [road, sidewalk, plaza] on top, [cycleway, green, parking] below. One texture, as the ground's shader already uses
// nearly every texture unit a device has (more at night). The ground (landscape.js LAND_CITY) draws from it; the city's
// modules ask the same map in JS where a thing may stand (on a sidewalk, off the road).
const KINDS=[['road','sidewalk','plaza'],['cycleway','green','parking']];
const maps=new WeakMap();

// Loads the image once per track data: {texture, bounds:Vector4(x0,y0,width,height), stack:Vector2, range, at(x,y), ...}.
// stack gives the shader each map's rows in the texture: v = stack.y + v_map*stack.x on top, v_map*stack.x below. The
// texture is data, not colour (no sRGB decoding), and keeps its mipmaps for the distant ground.
export function loadCityMap(data,folder='./assets/circuitos/'){
 if(maps.has(data))return maps.get(data);
 const map=data.scenery.city.map;
 const promise=new THREE.ImageLoader().loadAsync(folder+map.file).then(image=>{
  const texture=new THREE.Texture(image);texture.colorSpace=THREE.NoColorSpace;texture.wrapS=texture.wrapT=THREE.ClampToEdgeWrapping;texture.magFilter=THREE.LinearFilter;texture.minFilter=THREE.LinearMipmapLinearFilter;texture.generateMipmaps=true;texture.anisotropy=8;texture.needsUpdate=true;
  // The pixels for the JS side (row 0 is the north edge of the top map, as the image is written).
  const c=document.createElement('canvas');c.width=image.width;c.height=image.height;const g=c.getContext('2d',{willReadFrequently:true});g.drawImage(image,0,0);
  const P=g.getImageData(0,0,c.width,c.height).data,w=image.width,rows=map.rows,offset=[0,rows+map.gap],{x0,y0,width,height,px,range}=map;
  // Signed distance of a kind at (x, y), bilinear like the GPU's sampling; +range off the map.
  const sample=(img,channel,x,y)=>{
   const fx=(x-x0)/px-.5,fy=(y0+height-y)/px-.5;if(fx<0||fy<0||fx>w-1||fy>rows-1)return range;
   const i=Math.floor(fx),j=Math.floor(fy),u=fx-i,v=fy-j,i1=Math.min(i+1,w-1),j1=Math.min(j+1,rows-1),o=offset[img];
   const at=(a,b)=>P[((b+o)*w+a)*4+channel];
   const value=(at(i,j)*(1-u)+at(i1,j)*u)*(1-v)+(at(i,j1)*(1-u)+at(i1,j1)*u)*v;
   return (value/127.5-1)*range;
  };
  const at=(x,y)=>{const out={};KINDS.forEach((kinds,img)=>kinds.forEach((kind,channel)=>{out[kind]=sample(img,channel,x,y);}));return out;};
  const distance=(kind,x,y)=>{const img=KINDS.findIndex(k=>k.includes(kind));return sample(img,KINDS[img].indexOf(kind),x,y);};
  const total=image.height;
  return {texture,textures:[texture],bounds:new THREE.Vector4(x0,y0,width,height),stack:new THREE.Vector2(rows/total,(rows+map.gap)/total),range,at,distance,
   // What the ground shows at (x, y), the kind drawn on top (the road over all, then cycleway, sidewalk, plaza, parking, green).
   surface(x,y){const d=at(x,y);for(const kind of ['road','cycleway','sidewalk','plaza','parking','green'])if(d[kind]<0)return kind;return 'lot';},
   dispose(){texture.dispose();}};
 });
 maps.set(data,promise);return promise;
}
