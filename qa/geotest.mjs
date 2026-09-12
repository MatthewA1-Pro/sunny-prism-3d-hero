import * as G from '../lib/prismGeometry.js'
import * as THREE from 'three'

const tri = (g) => g.getAttribute('position').count / 3
const bbox = (g) => { g.computeBoundingBox(); const b=g.boundingBox;
  return `x[${b.min.x.toFixed(3)},${b.max.x.toFixed(3)}] y[${b.min.y.toFixed(3)},${b.max.y.toFixed(3)}] z[${b.min.z.toFixed(3)},${b.max.z.toFixed(3)}]` }

// signed volume via divergence theorem
function volume(g){ const p=g.getAttribute('position'); let v=0;
  for(let i=0;i<p.count;i+=3){
    const a=new THREE.Vector3().fromBufferAttribute(p,i), b=new THREE.Vector3().fromBufferAttribute(p,i+1), c=new THREE.Vector3().fromBufferAttribute(p,i+2);
    v += a.dot(new THREE.Vector3().crossVectors(b,c))/6;
  } return v }

const pyr = G.buildPyramid()
console.log('PYRAMID  tris:', tri(pyr), '| bbox:', bbox(pyr))
console.log('  volume:', volume(pyr).toFixed(5), ' expected (base 2x2, h 2) = 4/3*2 =', (4*2/3).toFixed(5))

const slices = G.buildSlices()
console.log('\nSLICES:', slices.length)
let sum=0
slices.forEach((s,i)=>{ const v=volume(s.geometry); sum+=v;
  console.log(` [${i}] k[${s.kLow},${s.kHigh}] tris:${tri(s.geometry)} vol:${v.toFixed(5)} centroid:(${s.centroid.x.toFixed(3)},${s.centroid.y.toFixed(3)},${s.centroid.z.toFixed(3)}) bbox:${bbox(s.geometry)}`)})
console.log(' sum of slice volumes:', sum.toFixed(5), '| matches pyramid?', Math.abs(sum-volume(pyr))<1e-4 ? 'YES' : 'NO -- MISMATCH')

console.log('\nCUT SWEEP')
const sweep = G.buildCutSweep()
console.log(' steps:', sweep.count, 'samples/step:', G.CUT_SWEEP_SAMPLES)
const mid = sweep.steps[48]
console.log(' mid-step first 3 pts:', [0,1,2].map(i=>`(${mid[i*3].toFixed(2)},${mid[i*3+1].toFixed(2)},${mid[i*3+2].toFixed(2)})`).join(' '))
let degenerate=0
sweep.steps.forEach(a=>{ let allZero=true; for(let i=0;i<a.length;i++) if(Math.abs(a[i])>1e-6) allZero=false; if(allZero) degenerate++ })
console.log(' degenerate steps:', degenerate)

console.log('\nSECTION half-extent: y=-1 ->', G.sectionHalfExtent(-1), '| y=0 ->', G.sectionHalfExtent(0), '| y=1 ->', G.sectionHalfExtent(1))
console.log('SLIDE_DIR:', `(${G.SLIDE_DIR.x.toFixed(4)},${G.SLIDE_DIR.y.toFixed(4)},${G.SLIDE_DIR.z.toFixed(4)})`)
console.log('CUT_NORMAL . SLIDE_DIR =', G.CUT_NORMAL.dot(G.SLIDE_DIR).toFixed(9), '(must be ~0: slide stays in the cut plane)')
