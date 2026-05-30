export interface BlockEntity {
  ':db/id'?: number;
  'block/id': string;           // UUID string
  'block/type': 'theorem' | 'lemma' | 'proof' | 'definition' | 'corollary' | 'proposition' | 'remark' | 'general' | 'page';
  'block/content': string;       // Markdown content
  'block/title'?: string;        // Extracted first-line title for bi-directional search
  'block/x': number;
  'block/y': number;
  'block/w': number;
  'block/h': number;
  'block/label'?: string;        // Optional Unique identifier/label for rendering references (e.g., \label{thm:pythagoras})
  'block/number'?: number;       // Auto-assigned counter rank for numbering
  'link/from'?: number[];        // References to other target block db IDs
  'link/to'?: number[];          // References to other source block db IDs
  'block/tag'?: string[];        // Array of tags associated with this block
  'block/parent'?: number;       // Parent block/page entity db reference ID
  'block/order'?: number;        // Sibling ordering key
}

export const schema = {
  'block/id': {
    ':db/unique': ':db.unique/identity',
  },
  'block/type': {},
  'block/content': {},
  'block/title': {},
  'block/x': {},
  'block/y': {},
  'block/w': {},
  'block/h': {},
  'block/label': {
    ':db/unique': ':db.unique/identity',
  },
  'block/number': {},
  'link/from': {
    ':db/valueType': ':db.type/ref',
    ':db/cardinality': ':db.cardinality/many',
  },
  'link/to': {
    ':db/valueType': ':db.type/ref',
    ':db/cardinality': ':db.cardinality/many',
  },
  'block/tag': {
    ':db/cardinality': ':db.cardinality/many',
  },
  'block/parent': {
    ':db/valueType': ':db.type/ref',
  },
  'block/order': {},
  'counter/id': {
    ':db/unique': ':db.unique/identity',
  },
  'counter/value': {},
};

