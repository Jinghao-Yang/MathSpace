export enum BlockType {
  General = 'general',
  Theorem = 'theorem',
  Lemma = 'lemma',
  Proof = 'proof',
  Definition = 'definition',
  Corollary = 'corollary',
  Proposition = 'proposition',
  Remark = 'remark',
  Page = 'page'
}

export interface BlockEntityRaw {
  ':db/id'?: number;
  'block/id': string;
  'block/type': BlockType;
  'block/content': string;
  'block/title'?: string;
  'block/x': number;
  'block/y': number;
  'block/w': number;
  'block/h': number;
  'block/label'?: string;
  'block/number'?: number;
  'link/from'?: number[];
  'link/to'?: number[];
  'block/tag'?: string[];
  'block/parent'?: number;
  'block/order'?: number;
}

export interface Block {
  id: string;
  dbId?: number;
  type: BlockType;
  content: string;
  title?: string;
  x: number;
  y: number;
  w: number;
  h: number;
  label?: string;
  number?: number;
  linkFrom?: number[];
  linkTo?: number[];
  tags?: string[];
  parent?: number;
  order?: number;
}

export function isBlockType(value: any): value is BlockType {
  return Object.values(BlockType).includes(value as BlockType);
}

export function isBlockEntityRaw(value: any): value is BlockEntityRaw {
  return (
    typeof value === 'object' &&
    value !== null &&
    'block/id' in value &&
    'block/type' in value &&
    'block/content' in value &&
    'block/x' in value &&
    'block/y' in value &&
    'block/w' in value &&
    'block/h' in value
  );
}

export function isBlock(value: any): value is Block {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    'type' in value &&
    'content' in value &&
    'x' in value &&
    'y' in value &&
    'w' in value &&
    'h' in value
  );
}

export function convertRawBlockToBlock(raw: BlockEntityRaw): Block {
  return {
    id: raw['block/id'],
    dbId: raw[':db/id'],
    type: raw['block/type'],
    content: raw['block/content'],
    title: raw['block/title'],
    x: raw['block/x'],
    y: raw['block/y'],
    w: raw['block/w'],
    h: raw['block/h'],
    label: raw['block/label'],
    number: raw['block/number'],
    linkFrom: raw['link/from'],
    linkTo: raw['link/to'],
    tags: raw['block/tag'],
    parent: raw['block/parent'],
    order: raw['block/order']
  };
}

export function convertBlockToRawBlock(block: Block): BlockEntityRaw {
  const raw: BlockEntityRaw = {
    'block/id': block.id,
    'block/type': block.type,
    'block/content': block.content,
    'block/x': block.x,
    'block/y': block.y,
    'block/w': block.w,
    'block/h': block.h
  };

  if (block.dbId !== undefined) {
    raw[':db/id'] = block.dbId;
  }
  if (block.title !== undefined) {
    raw['block/title'] = block.title;
  }
  if (block.label !== undefined) {
    raw['block/label'] = block.label;
  }
  if (block.number !== undefined) {
    raw['block/number'] = block.number;
  }
  if (block.linkFrom !== undefined) {
    raw['link/from'] = block.linkFrom;
  }
  if (block.linkTo !== undefined) {
    raw['link/to'] = block.linkTo;
  }
  if (block.tags !== undefined) {
    raw['block/tag'] = block.tags;
  }
  if (block.parent !== undefined) {
    raw['block/parent'] = block.parent;
  }
  if (block.order !== undefined) {
    raw['block/order'] = block.order;
  }

  return raw;
}
