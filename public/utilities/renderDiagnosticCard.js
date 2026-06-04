export function renderDiagnosticCard(alloc) {
  elDiagNode.innerText = alloc.id;
  elDiagGeo.innerText = `${alloc.latitude.toFixed(4)}, ${alloc.longitude.toFixed(4)}`;
  elDiagIsp.innerText = alloc.isp;
}
