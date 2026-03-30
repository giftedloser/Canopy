export interface FlatOu {
  dn: string;
  name: string;
  canonical?: string;
}

export interface OuTreeNode {
  dn: string;
  name: string;
  children: OuTreeNode[];
}

/**
 * Build a nested tree from a flat list of OUs.
 * Each OU's parent is derived by stripping the first "OU=..." or "CN=..." segment from its DN.
 */
export function buildOuTree(flatOus: FlatOu[]): OuTreeNode[] {
  const nodeMap = new Map<string, OuTreeNode>();

  // Create nodes
  for (const ou of flatOus) {
    nodeMap.set(ou.dn.toLowerCase(), {
      dn: ou.dn,
      name: ou.name,
      children: [],
    });
  }

  const roots: OuTreeNode[] = [];

  for (const ou of flatOus) {
    const node = nodeMap.get(ou.dn.toLowerCase())!;
    const parentDn = getParentDn(ou.dn);
    const parentNode = parentDn ? nodeMap.get(parentDn.toLowerCase()) : undefined;

    if (parentNode) {
      parentNode.children.push(node);
    } else {
      roots.push(node);
    }
  }

  // Sort children alphabetically
  const sortChildren = (nodes: OuTreeNode[]) => {
    nodes.sort((a, b) => a.name.localeCompare(b.name));
    for (const n of nodes) sortChildren(n.children);
  };
  sortChildren(roots);

  return roots;
}

function getParentDn(dn: string): string | null {
  const idx = dn.indexOf(",");
  if (idx === -1) return null;
  return dn.substring(idx + 1);
}
