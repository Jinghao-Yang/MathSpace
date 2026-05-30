export interface Snippet {
  trigger: string | RegExp;
  replacement: string | ((match: RegExpMatchArray) => string);
  options: string;
  priority?: number;
  description?: string;
}

const GREEK_LIST = [
  'alpha', 'beta', 'gamma', 'Gamma', 'delta', 'Delta', 'epsilon', 'varepsilon',
  'zeta', 'theta', 'Theta', 'vartheta', 'iota', 'kappa', 'lambda', 'Lambda',
  'sigma', 'Sigma', 'upsilon', 'Upsilon', 'omega', 'Omega', 'eta', 'phi', 'Phi',
  'varphi', 'chi', 'psi', 'Psi', 'tau', 'rho', 'xi', 'Xi', 'pi', 'Pi'
];

export const snippetList: Snippet[] = [
  // =========================================================================
  // CATEGORY A: Math Mode Entry
  // =========================================================================
  {
    trigger: 'mk',
    replacement: '$$0$',
    options: 'tA',
    priority: 10,
    description: 'Inline math mode'
  },
  {
    trigger: 'dm',
    replacement: '$$\n\t$0\n$$',
    options: 'tAw',
    priority: 10,
    description: 'Display math mode'
  },

  // =========================================================================
  // CATEGORY B: Greek Letters
  // =========================================================================
  // @-prefixed style
  { trigger: '@a', replacement: '\\alpha', options: 'mA', description: 'alpha' },
  { trigger: '@b', replacement: '\\beta', options: 'mA', description: 'beta' },
  { trigger: '@g', replacement: '\\gamma', options: 'mA', description: 'gamma' },
  { trigger: '@G', replacement: '\\Gamma', options: 'mA', description: 'Gamma' },
  { trigger: '@d', replacement: '\\delta', options: 'mA', description: 'delta' },
  { trigger: '@D', replacement: '\\Delta', options: 'mA', description: 'Delta' },
  { trigger: '@e', replacement: '\\epsilon', options: 'mA', description: 'epsilon' },
  { trigger: ':e', replacement: '\\varepsilon', options: 'mA', description: 'varepsilon' },
  { trigger: '@z', replacement: '\\zeta', options: 'mA', description: 'zeta' },
  { trigger: '@t', replacement: '\\theta', options: 'mA', description: 'theta' },
  { trigger: '@T', replacement: '\\Theta', options: 'mA', description: 'Theta' },
  { trigger: ':t', replacement: '\\vartheta', options: 'mA', description: 'vartheta' },
  { trigger: '@i', replacement: '\\iota', options: 'mA', description: 'iota' },
  { trigger: '@k', replacement: '\\kappa', options: 'mA', description: 'kappa' },
  { trigger: '@l', replacement: '\\lambda', options: 'mA', description: 'lambda' },
  { trigger: '@L', replacement: '\\Lambda', options: 'mA', description: 'Lambda' },
  { trigger: '@s', replacement: '\\sigma', options: 'mA', description: 'sigma' },
  { trigger: '@S', replacement: '\\Sigma', options: 'mA', description: 'Sigma' },
  { trigger: '@u', replacement: '\\upsilon', options: 'mA', description: 'upsilon' },
  { trigger: '@U', replacement: '\\Upsilon', options: 'mA', description: 'Upsilon' },
  { trigger: '@o', replacement: '\\omega', options: 'mA', description: 'omega' },
  { trigger: '@O', replacement: '\\Omega', options: 'mA', description: 'Omega' },

  // Bare-letter style
  { trigger: 'ome', replacement: '\\omega', options: 'mA', description: 'omega' },
  { trigger: 'Ome', replacement: '\\Omega', options: 'mA', description: 'Omega' },

  // =========================================================================
  // CATEGORY C: Blackboard Bold
  // =========================================================================
  { trigger: 'RR', replacement: '\\mathbb{R}', options: 'mA', description: 'Real numbers R' },
  { trigger: 'CC', replacement: '\\mathbb{C}', options: 'mA', description: 'Complex numbers C' },
  { trigger: 'ZZ', replacement: '\\mathbb{Z}', options: 'mA', description: 'Integers Z' },
  { trigger: 'NN', replacement: '\\mathbb{N}', options: 'mA', description: 'Natural numbers N' },

  // =========================================================================
  // CATEGORY D: Basic Math Operations
  // =========================================================================
  { trigger: 'sr', replacement: '^{2}', options: 'mA', description: 'squared' },
  { trigger: 'cb', replacement: '^{3}', options: 'mA', description: 'cubed' },
  { trigger: 'rd', replacement: '^{$0}$1', options: 'mA', description: 'superscript' },
  { trigger: '_', replacement: '_{$0}$1', options: 'mA', description: 'subscript' },
  { trigger: 'sq', replacement: '\\sqrt{ $0 }$1', options: 'mA', description: 'square root' },
  { trigger: '//', replacement: '\\frac{$0}{$1}$2', options: 'mA', description: 'fraction' },
  { trigger: 'ee', replacement: 'e^{ $0 }$1', options: 'mA', description: 'exponential' },
  { trigger: 'invs', replacement: '^{-1}', options: 'mA', description: 'inverse' },

  // =========================================================================
  // CATEGORY E: Symbols
  // =========================================================================
  { trigger: 'ooo', replacement: '\\infty', options: 'mA', description: 'infinity' },
  { trigger: 'sum', replacement: '\\sum', options: 'mA', description: 'sum' },
  { trigger: 'prod', replacement: '\\prod', options: 'mA', description: 'product' },
  { trigger: 'lim', replacement: '\\lim_{ ${0:n} \\to ${1:\\infty} } $2', options: 'mA', description: 'limit' },
  
  { trigger: '+-', replacement: '\\pm', options: 'mA', description: 'plus minus' },
  { trigger: '-+', replacement: '\\mp', options: 'mA', description: 'minus plus' },
  { trigger: '...', replacement: '\\dots', options: 'mA', description: 'dots' },
  { trigger: 'xx', replacement: '\\times', options: 'mA', description: 'times' },
  { trigger: '**', replacement: '\\cdot', options: 'mA', description: 'dot' },
  
  { trigger: '==', replacement: '\\equiv', options: 'mA', description: 'equivalent' },
  { trigger: '!=', replacement: '\\neq', options: 'mA', description: 'not equal' },
  { trigger: '>=', replacement: '\\geq', options: 'mA', description: 'greater of equal' },
  { trigger: '<=', replacement: '\\leq', options: 'mA', description: 'less or equal' },
  { trigger: '<<', replacement: '\\ll', options: 'mA', description: 'much less' },
  { trigger: '>>', replacement: '\\gg', options: 'mA', description: 'much greater' },
  
  { trigger: 'simm', replacement: '\\sim', options: 'mA', description: 'similar' },
  { trigger: 'sim=', replacement: '\\simeq', options: 'mA', description: 'similar or equal' },
  { trigger: 'prop', replacement: '\\propto', options: 'mA', description: 'proportional to' },
  
  { trigger: '->', replacement: '\\to', options: 'mA', description: 'to' },
  { trigger: '=>', replacement: '\\implies', options: 'mA', description: 'implies' },
  { trigger: '=<', replacement: '\\impliedby', options: 'mA', description: 'implied by' },
  { trigger: '!>', replacement: '\\mapsto', options: 'mA', description: 'maps to' },
  { trigger: '<->', replacement: '\\leftrightarrow', options: 'mA', description: 'iff' },
  
  { trigger: 'and', replacement: '\\cap', options: 'mA', description: 'intersection' },
  { trigger: 'orr', replacement: '\\cup', options: 'mA', description: 'union' },
  { trigger: 'inn', replacement: '\\in', options: 'mA', description: 'element of' },
  { trigger: 'notin', replacement: '\\not\\in', options: 'mA', description: 'not element of' },
  { trigger: 'sub=', replacement: '\\subseteq', options: 'mA', description: 'subset or equal' },
  { trigger: 'sup=', replacement: '\\supseteq', options: 'mA', description: 'superset or equal' },
  { trigger: 'eset', replacement: '\\emptyset', options: 'mA', description: 'empty set' },

  // =========================================================================
  // CATEGORY F: Greek Letter Decorators
  // =========================================================================
  { trigger: /([a-zA-Z])hat$/, replacement: '\\hat{[[0]]}', options: 'rmA', priority: -1 },
  { trigger: /([a-zA-Z])bar$/, replacement: '\\bar{[[0]]}', options: 'rmA', priority: -1 },
  { trigger: /([a-zA-Z])dot$/, replacement: '\\dot{[[0]]}', options: 'rmA', priority: -1 },
  { trigger: /([a-zA-Z])ddot$/, replacement: '\\ddot{[[0]]}', options: 'rmA', priority: -1 },
  { trigger: /([a-zA-Z])tilde$/, replacement: '\\tilde{[[0]]}', options: 'rmA', priority: -1 },
  { trigger: /([a-zA-Z])vec$/, replacement: '\\vec{[[0]]}', options: 'rmA', priority: -1 },
  { trigger: /([a-zA-Z])und$/, replacement: '\\underline{[[0]]}', options: 'rmA', priority: -1 },

  // =========================================================================
  // CATEGORY G: Auto-Subscript
  // =========================================================================
  {
    trigger: new RegExp(`(\\\\(?:${GREEK_LIST.join('|')})|[A-Za-z])(\\d)$`),
    replacement: '[[0]]_{[[1]]}',
    options: 'rmA',
    priority: -1
  },
  {
    trigger: new RegExp(`(\\\\(?:${GREEK_LIST.join('|')})|[A-Za-z])_\\{(\\d+)\\}(\\d)$`),
    replacement: '[[0]]_{[[1]][[2]]}',
    options: 'rmA',
    priority: -1
  },

  // =========================================================================
  // CATEGORY H: Brackets and Delimiters
  // =========================================================================
  { trigger: 'avg', replacement: '\\langle $0 \\rangle $1', options: 'mA', description: 'average / inner product' },
  { trigger: 'norm', replacement: '\\lvert $0 \\rvert $1', options: 'mA', description: 'single norm' },
  { trigger: 'Norm', replacement: '\\lVert $0 \\rVert $1', options: 'mA', description: 'double norm' },
  { trigger: '(', replacement: '($0)$1', options: 'mA', description: 'parentheses' },
  { trigger: '[', replacement: '[$0]$1', options: 'mA', description: 'brackets' },
  { trigger: '{', replacement: '{$0}$1', options: 'mA', description: 'braces' },
  { trigger: 'lr(', replacement: '\\left( $0 \\right) $1', options: 'mA', description: 'auto-scaling parentheses' },
  { trigger: 'lr{', replacement: '\\left\\{ $0 \\right\\} $1', options: 'mA', description: 'auto-scaling braces' },
  { trigger: 'lr[', replacement: '\\left[ $0 \\right] $1', options: 'mA', description: 'auto-scaling brackets' },
  { trigger: 'lr|', replacement: '\\left| $0 \\right| $1', options: 'mA', description: 'auto-scaling pipes' },

  // =========================================================================
  // CATEGORY I: Derivatives and Integrals
  // =========================================================================
  { trigger: 'ddt', replacement: '\\frac{d}{dt} ', options: 'mA', description: 'd/dt' },
  { trigger: 'par', replacement: '\\frac{ \\partial ${0:y} }{ \\partial ${1:x} } $2', options: 'm', description: 'partial derivative' },
  { trigger: 'dint', replacement: '\\int_{${0:0}}^{${1:1}} $2 \\, d${3:x} $4', options: 'mA', description: 'definite integral' },
  { trigger: 'oinf', replacement: '\\int_{0}^{\\infty} $0 \\, d${1:x} $2', options: 'mA', description: 'integral 0 to infinity' },
  { trigger: 'infi', replacement: '\\int_{-\\infty}^{\\infty} $0 \\, d${1:x} $2', options: 'mA', description: 'integral -inf to inf' },

  // =========================================================================
  // CATEGORY J: Matrix and Environment Quick-Create
  // =========================================================================
  { trigger: /pmat$/, replacement: '\\begin{pmatrix}\n$0\n\\end{pmatrix}', options: 'rmA', description: 'pmatrix environment' },
  { trigger: /bmat$/, replacement: '\\begin{bmatrix}\n$0\n\\end{bmatrix}', options: 'rmA', description: 'bmatrix environment' },
  { trigger: /Bmat$/, replacement: '\\begin{Bmatrix}\n$0\n\\end{Bmatrix}', options: 'rmA', description: 'Bmatrix environment' },
  { trigger: /vmat$/, replacement: '\\begin{vmatrix}\n$0\n\\end{vmatrix}', options: 'rmA', description: 'vmatrix environment' },
  { trigger: /Vmat$/, replacement: '\\begin{Vmatrix}\n$0\n\\end{Vmatrix}', options: 'rmA', description: 'Vmatrix environment' },
  { trigger: /cases$/, replacement: '\\begin{cases}\n$0\n\\end{cases}', options: 'rmA', description: 'cases environment' },
  { trigger: /align$/, replacement: '\\begin{align}\n$0\n\\end{align}', options: 'rmA', description: 'align environment' },

  // =========================================================================
  // CATEGORY K: Trigonometric Functions
  // =========================================================================
  { trigger: 'sin', replacement: '\\sin $0', options: 'mA', description: 'sine' },
  { trigger: 'cos', replacement: '\\cos $0', options: 'mA', description: 'cosine' },
  { trigger: 'tan', replacement: '\\tan $0', options: 'mA', description: 'tangent' },
  { trigger: 'csc', replacement: '\\csc $0', options: 'mA', description: 'cosecant' },
  { trigger: 'sec', replacement: '\\sec $0', options: 'mA', description: 'secant' },
  { trigger: 'cot', replacement: '\\cot $0', options: 'mA', description: 'cotangent' },
  { trigger: 'arcsin', replacement: '\\arcsin $0', options: 'mA', description: 'arcsine' },
  { trigger: 'arccos', replacement: '\\arccos $0', options: 'mA', description: 'arccosine' },
  { trigger: 'arctan', replacement: '\\arctan $0', options: 'mA', description: 'arctangent' },
  
  // Trig spacing fixer: e.g. \sinx -> \sin x
  {
    trigger: /\\(sin|cos|tan|csc|sec|cot)([A-Za-gi-z])$/,
    replacement: '\\[[0]] [[1]]',
    options: 'rmA',
    priority: 10
  },

  // =========================================================================
  // CATEGORY L: Visual Operations
  // =========================================================================
  { trigger: 'U', replacement: '\\underbrace{ ${VISUAL} }_{ $0 }', options: 'mA', description: 'underbrace visual selection' },
  { trigger: 'O', replacement: '\\overbrace{ ${VISUAL} }^{ $0 }', options: 'mA', description: 'overbrace visual selection' },
  { trigger: 'B', replacement: '\\underset{ $0 }{ ${VISUAL} }', options: 'mA', description: 'underset visual selection' },
  { trigger: 'C', replacement: '\\cancel{ ${VISUAL} }', options: 'mA', description: 'cancel visual selection' }
];
