import fs from 'node:fs';import path from 'node:path';
export function prepareVisuals(data,temp,context,visuals){
 if(visuals==null)return {paths:[],labels:[]};if(context.route!=='compose'||!Array.isArray(visuals.images)||visuals.images.length>4)throw Error('搭建视觉输入无效');const paths=[],labels=[];
 const sha=context.project?.reference?.sha;if(sha!=null){if(!/^[a-f0-9]{64}$/.test(sha))throw Error('参考图无效');const file=path.join(data,'references',sha+'.png');if(!fs.existsSync(file))throw Error('参考图文件不存在');paths.push(file);labels.push('原参考渲染图');}
 for(const [n,image] of visuals.images.entries()){if(typeof image.label!=='string'||image.label.length>120||typeof image.data!=='string'||!/^data:image\/png;base64,[a-zA-Z0-9+/=]+$/.test(image.data))throw Error('截图格式无效');const bytes=Buffer.from(image.data.slice(22),'base64');if(bytes.length<33||bytes.length>2*1048576||bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a'||bytes.readUInt32BE(16)>2048||bytes.readUInt32BE(20)>2048)throw Error('截图尺寸或大小无效');const file=path.join(temp,'view-'+n+'.png');fs.writeFileSync(file,bytes,{mode:0o600});paths.push(file);labels.push(image.label);}
 return {paths,labels};
}
