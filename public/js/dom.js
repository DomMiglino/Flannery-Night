// Passo 4: helper per costruire nodi. Il testo che arriva dall'API entra
// sempre con textContent: mai innerHTML.

export function el(tag, opts = {}) {
  const node = document.createElement(tag);
  if (opts.className) node.className = opts.className;
  if (opts.text !== undefined && opts.text !== null) node.textContent = String(opts.text);
  if (opts.attrs) {
    for (const [name, value] of Object.entries(opts.attrs)) {
      if (value === null || value === undefined || value === false) continue;
      node.setAttribute(name, String(value));
    }
  }
  if (opts.on) {
    for (const [event, handler] of Object.entries(opts.on)) node.addEventListener(event, handler);
  }
  if (opts.children) {
    for (const child of [].concat(opts.children)) {
      if (child) node.append(child);
    }
  }
  return node;
}

const SVG_NS = "http://www.w3.org/2000/svg";

export function svg(tag, attrs = {}, children = []) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    node.setAttribute(name, String(value));
  }
  for (const child of [].concat(children)) {
    if (child) node.append(child);
  }
  return node;
}

export function clear(node) {
  while (node && node.firstChild) node.removeChild(node.firstChild);
  return node;
}

export function replace(node, ...children) {
  clear(node);
  for (const child of children.flat()) {
    if (child) node.append(child);
  }
  return node;
}

/** Collega un link interno senza ricaricare la pagina. */
export function linkInterno(node, navigate) {
  node.addEventListener("click", (evento) => {
    if (evento.defaultPrevented) return;
    if (evento.button !== 0 || evento.metaKey || evento.ctrlKey || evento.shiftKey || evento.altKey) return;
    evento.preventDefault();
    navigate(node.getAttribute("href") || "/");
  });
  return node;
}