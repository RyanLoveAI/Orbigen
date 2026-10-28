// Keep the entire bounding sphere in the narrower camera field of view.
// The distance stays constant while the thumbnail rotates.
export function previewDistance(dimensions,aspect,fov=37){
 const halfFov=fov*Math.PI/360,angle=Math.min(halfFov,Math.atan(Math.tan(halfFov)*aspect));
 return Math.hypot(...dimensions)*.5*1.08/Math.sin(angle);
}
