import {Unzlib} from 'fflate';

const invalid=()=>{throw Error('Word包含无效或不支持的图片，请核对原图');};
const text=(bytes:Uint8Array,at:number,size:number)=>String.fromCharCode(...bytes.subarray(at,at+size));
function crc32(bytes:Uint8Array){let crc=0xffffffff;for(const byte of bytes){crc^=byte;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;}
// Validate supported raster containers before reporting an embedded image as present.
// Relevance and visual rendering remain the agent's existing image review responsibility.
export function assertRasterImage(bytes:Uint8Array){
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 if(bytes.length>=33&&bytes[0]===137&&text(bytes,1,7)==='PNG\r\n\x1a\n'){
  let at=8,width=0,height=0,depth=0,channels=0,interlace=0,ended=false;const data:Uint8Array[]=[];
  while(at+12<=bytes.length){const length=view.getUint32(at),kind=text(bytes,at+4,4),end=at+12+length;if(end>bytes.length||crc32(bytes.subarray(at+4,at+8+length))!==view.getUint32(at+8+length))return invalid();
   if(at===8){if(kind!=='IHDR'||length!==13)return invalid();width=view.getUint32(at+8);height=view.getUint32(at+12);depth=bytes[at+16];const color=bytes[at+17];channels=({0:1,2:3,3:1,4:2,6:4} as Record<number,number>)[color]||0;interlace=bytes[at+20];if(!width||!height||!channels||width*height>16_000_000||![1,2,4,8,16].includes(depth)||((color===2||color===4||color===6)&&depth<8)||(color===3&&depth===16)||bytes[at+18]!==0||bytes[at+19]!==0||interlace>1)return invalid();}
   else if(kind==='IHDR')return invalid();
   if(kind==='IDAT')data.push(bytes.subarray(at+8,at+8+length));
   if(kind==='IEND'){if(length!==0||end!==bytes.length) return invalid();ended=true;break;}at=end;
  }
  if(!ended||!data.length)return invalid();
  const passes=interlace?[[0,0,8,8],[4,0,8,8],[0,4,4,8],[2,0,4,4],[0,2,2,4],[1,0,2,2],[0,1,1,2]]:[[0,0,1,1]];
  let expected=0;for(const [x,y,dx,dy] of passes){const w=Math.max(0,Math.ceil((width-x)/dx)),h=Math.max(0,Math.ceil((height-y)/dy));if(w&&h)expected+=h*(1+Math.ceil(w*channels*depth/8));}if(expected>64_000_000)return invalid();
  let inflated=0,done=false;try{const unzip=new Unzlib((chunk,final)=>{inflated+=chunk.length;if(inflated>expected)return invalid();done=final;});for(let i=0;i<data.length;i++)for(let at=0;at<data[i].length;at+=512)unzip.push(data[i].subarray(at,at+512),i===data.length-1&&at+512>=data[i].length);}catch{return invalid();}
  if(!done||inflated!==expected)return invalid();return;
 }
 if(bytes.length>=4&&bytes[0]===255&&bytes[1]===216){
  let at=2,frame=false,scan=false,ended=false;
  while(at<bytes.length){if(bytes[at++]!==255)return invalid();while(bytes[at]===255)at++;const marker=bytes[at++];if(marker===217){ended=true;break;}if(marker===0||marker===216)return invalid();if(marker>=208&&marker<=215)continue;
   if(at+2>bytes.length)return invalid();const size=view.getUint16(at);if(size<2||at+size>bytes.length)return invalid();
   if([192,193,194].includes(marker)){if(size<8||!view.getUint16(at+3)||!view.getUint16(at+5))return invalid();frame=true;}
   at+=size;
   if(marker===218){scan=true;while(at<bytes.length-1){if(bytes[at]!==255){at++;continue;}const next=bytes[at+1];if(next===0||(next>=208&&next<=215)){at+=2;continue;}break;}}
  }
  if(!frame||!scan||!ended||at!==bytes.length)return invalid();return;
 }
 if(bytes.length>=20&&text(bytes,0,4)==='RIFF'&&text(bytes,8,4)==='WEBP'&&view.getUint32(4,true)+8===bytes.length){
  let at=12,image=false;while(at+8<=bytes.length){const type=text(bytes,at,4),size=view.getUint32(at+4,true),end=at+8+size;if(end>bytes.length)return invalid();if(type==='VP8 '){if(size<10||text(bytes,at+11,3)!=='\x9d\x01\x2a')return invalid();image=true;}if(type==='VP8L'){if(size<5||bytes[at+8]!==47)return invalid();image=true;}at=end+(size%2);}
  if(!image||at!==bytes.length)return invalid();return;
 }
 return invalid();
}
