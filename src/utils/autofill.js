export const AF_DATA = {
  'WOOD':    { subtypes: ['Teak','Mahogany','Ash','Rosewood'], finishes: ['Matt Polish','Glossy Polish','PU Matt Polish','PU Glossy Polish','Duco Paint Finish','PU Paint Finish'] },
  'PLYWOOD': { subtypes: ['Grade 710 BWR (Waterproof)','Grade 303 MR (Commercial)'], finishes: ['Laminate Finish','Veneer with Polish','Duco Paint Finish','PU Paint Finish'] },
  'H.D.F':  { subtypes: [], finishes: ['PU Paint Finish','Duco Paint Finish','Laminate Finish'] },
  'VENEER':  { subtypes: [], finishes: ['Matt Polish','Glossy Polish','PU Matt Polish','PU Glossy Polish'] },
  'METAL':   { subtypes: ['Mild Steel (MS)','Stainless Steel (SS)'], finishes: ['Powder Coated Finish','PU Paint Finish','Duco Paint Finish'] },
};

export const AF_STRUCTURE_KEYS = ['WOOD','PLYWOOD','H.D.F','VENEER','METAL'];

export function generateDescription(itemName, afState) {
  const selectedKeys = Object.keys(afState.selections || {});
  const itemLabel = (itemName || '').trim() || 'Item';
  if (!selectedKeys.length) return '';
  
  const materialParts = [];
  selectedKeys.forEach(key => {
    const subtypes = [...(afState.selections[key]?.subtypes || [])];
    if (key === 'METAL') {
      if (subtypes.length) subtypes.forEach(sub => materialParts.push(sub));
      else materialParts.push('Metal');
    } else {
      const titleCaseKey = key === 'H.D.F' ? 'HDF' : key.charAt(0) + key.slice(1).toLowerCase();
      if (subtypes.length) subtypes.forEach(sub => materialParts.push(`${sub} ${titleCaseKey}`));
      else materialParts.push(titleCaseKey);
    }
  });
  
  let matStr = '';
  if (materialParts.length === 1) matStr = materialParts[0];
  else if (materialParts.length > 1) {
    const last = materialParts.pop();
    matStr = materialParts.join(', ') + ' and ' + last;
  }
  
  let desc = `${itemLabel} in ${matStr}`;

  // Upholstery details
  const uphArr = afState.upholstery ? [...afState.upholstery].map(x => x.toLowerCase()) : [];
  let uphStr = '';
  if (uphArr.length > 0) {
    let partsStr = '';
    if (uphArr.length === 1) partsStr = uphArr[0];
    else { const last = uphArr.pop(); partsStr = uphArr.join(', ') + ' and ' + last; }
    uphStr = `with upholstery on ${partsStr}`;
  }

  // Rope details
  const ropeArr = afState.rope ? [...afState.rope].map(x => x.toLowerCase()) : [];
  let ropeStr = '';
  if (ropeArr.length > 0) {
    let partsStr = '';
    if (ropeArr.length === 1) partsStr = ropeArr[0];
    else { const last = ropeArr.pop(); partsStr = ropeArr.join(', ') + ' and ' + last; }
    ropeStr = `with rope work on ${partsStr}`;
  }

  // Cane details
  const caneArr = afState.cane ? [...afState.cane].map(x => x.toLowerCase()) : [];
  let caneStr = '';
  if (caneArr.length > 0) {
    let partsStr = '';
    if (caneArr.length === 1) partsStr = caneArr[0];
    else { const last = caneArr.pop(); partsStr = caneArr.join(', ') + ' and ' + last; }
    caneStr = `with cane work on ${partsStr}`;
  }

  let details = [];
  if (uphStr) details.push(uphStr);
  if (ropeStr) details.push(ropeStr);
  if (caneStr) details.push(caneStr);
  
  if (details.length > 0) {
    let detailsJoined = '';
    if (details.length === 1) {
      detailsJoined = details[0];
    } else if (details.length === 2) {
      detailsJoined = details.join(' and ');
    } else {
      const lastDetail = details.pop();
      detailsJoined = details.join(', ') + ' and ' + lastDetail;
    }
    desc += ` ${detailsJoined}`;
  }

  // Wood/Plywood/etc finishes (multi-select)
  const finishArr = afState.finishes ? [...afState.finishes] : [];
  if (finishArr.length) {
    const fStr = finishArr.length === 1 ? finishArr[0] : finishArr.join(' and ');
    desc += `, finished with ${fStr}`;
  }

  desc += `, with reference to the provided image.`;
  return desc;
}
