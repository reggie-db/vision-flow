import type { CaptureGuide, CategoryContract } from '../shared/vision-contracts.ts';

export interface DemoCategorySpec {
  displayName: string;
  slug: string;
  description: string;
  captureGuide: CaptureGuide;
  contract: CategoryContract;
  prompt: string;
}

export const DEMO_CATEGORY_SPECS: DemoCategorySpec[] = [
  {
    displayName: 'Lottery receipt',
    slug: 'lottery_receipt',
    description: 'Lottery purchase receipt with state, dates, line items, quantities, and amounts.',
    captureGuide: 'vertical',
    prompt:
      'Lottery purchase receipt with state, transaction and draw dates, ticket line items, quantities, amounts, retailer, and barcode when present.',
    contract: {
      documentIntent: 'A receipt or ticket issued for the purchase of one or more state lottery games or plays.',
      extractionInstructions:
        'Extract only values printed on the lottery receipt. Create one line item for each printed game, play, or wager row; do not combine separate rows. Preserve played number order. Capture quantities, unit amounts, and line amounts independently when printed, plus the receipt totals. Normalize an unambiguous printed date to YYYY-MM-DD. Use null for obscured or absent values and never calculate or infer missing dates, quantities, or amounts.',
      fields: [
        {
          name: 'state',
          label: 'State',
          description: 'U.S. state or lottery jurisdiction printed on the receipt.',
          type: 'string',
          required: true,
        },
        {
          name: 'ticket_number',
          label: 'Ticket number',
          description: 'Printed ticket, receipt, or transaction identifier.',
          type: 'string',
          required: true,
        },
        {
          name: 'transaction_date',
          label: 'Transaction date',
          description: 'Purchase, sale, or transaction date printed on the receipt.',
          type: 'date',
          required: true,
        },
        {
          name: 'line_items',
          label: 'Line items',
          description: 'Individual game, play, or wager rows printed on the lottery receipt.',
          type: 'array',
          required: true,
          itemFields: [
            {
              name: 'game',
              label: 'Game',
              description: 'Lottery game name.',
              type: 'string',
              required: true,
            },
            {
              name: 'draw_date',
              label: 'Draw date',
              description: 'Draw date when printed.',
              type: 'date',
              required: false,
            },
            {
              name: 'play_numbers',
              label: 'Play numbers',
              description: 'Played or selected numbers in their printed order when present.',
              type: 'string',
              required: false,
            },
            {
              name: 'quantity',
              label: 'Quantity',
              description: 'Printed quantity of tickets, draws, plays, or units represented by the line.',
              type: 'integer',
              required: true,
            },
            {
              name: 'unit_amount',
              label: 'Unit amount',
              description: 'Printed price or wager amount for one unit when shown separately.',
              type: 'currency',
              required: false,
            },
            {
              name: 'line_amount',
              label: 'Line amount',
              description: 'Printed total amount for the line item.',
              type: 'currency',
              required: true,
            },
            {
              name: 'multiplier',
              label: 'Multiplier',
              description: 'Multiplier or add-on option when present.',
              type: 'string',
              required: false,
            },
          ],
        },
        {
          name: 'total_quantity',
          label: 'Total quantity',
          description: 'Printed total count of tickets, plays, draws, or units when present.',
          type: 'integer',
          required: false,
        },
        {
          name: 'total_amount',
          label: 'Total amount',
          description: 'Total purchase or amount paid printed on the receipt.',
          type: 'currency',
          required: true,
        },
        {
          name: 'retailer_name',
          label: 'Retailer',
          description: 'Retailer or sales location printed on the receipt.',
          type: 'string',
          required: false,
        },
        {
          name: 'barcode',
          label: 'Barcode value',
          description: 'Human-readable barcode value when visible.',
          type: 'string',
          required: false,
        },
      ],
    },
  },
  {
    displayName: 'ID verification',
    slug: 'id_verification',
    description: 'Government-issued identity card with identity, jurisdiction, and validity fields.',
    captureGuide: 'horizontal',
    prompt:
      'Government-issued ID with full name, document number, jurisdiction, date of birth, expiration date, address, and document class when present.',
    contract: {
      documentIntent: 'A government-issued identity card or driver license presented for identity verification.',
      extractionInstructions:
        'Extract identity and validity fields exactly as printed on the front of the card. Do not infer obscured values or normalize document numbers.',
      fields: [
        {
          name: 'full_name',
          label: 'Full name',
          description: 'Cardholder name as printed on the document.',
          type: 'string',
          required: true,
        },
        {
          name: 'document_number',
          label: 'Document number',
          description: 'License or identity document number.',
          type: 'string',
          required: true,
        },
        {
          name: 'jurisdiction',
          label: 'Jurisdiction',
          description: 'Issuing state, province, territory, or country.',
          type: 'string',
          required: true,
        },
        {
          name: 'date_of_birth',
          label: 'Date of birth',
          description: 'Cardholder date of birth.',
          type: 'date',
          required: true,
        },
        {
          name: 'expiration_date',
          label: 'Expiration date',
          description: 'Document expiration date.',
          type: 'date',
          required: true,
        },
        {
          name: 'address',
          label: 'Address',
          description: 'Cardholder address when printed on the document.',
          type: 'string',
          required: false,
        },
        {
          name: 'document_class',
          label: 'Document class',
          description: 'License class or identity document type when shown.',
          type: 'string',
          required: false,
        },
      ],
    },
  },
  {
    displayName: 'Store layout audit',
    slug: 'store_layout_audit',
    description: 'Retail shelf or display audit with products, facings, stock, pricing, and compliance findings.',
    captureGuide: 'none',
    prompt:
      'Store shelf or display photo with department, fixtures, products, brands, facing counts, stock status, price labels, promotional signage, and layout compliance.',
    contract: {
      documentIntent:
        'A retail shelf, endcap, cooler, or promotional display photographed for layout and merchandising review.',
      extractionInstructions:
        'Describe only visible fixtures and products. Count visible facings rather than estimating hidden inventory. Record uncertain or obstructed areas in the compliance summary.',
      fields: [
        {
          name: 'department',
          label: 'Department',
          description: 'Store department or display area when identifiable.',
          type: 'string',
          required: false,
        },
        {
          name: 'fixtures',
          label: 'Fixtures and products',
          description: 'Visible fixtures and the products merchandised within them.',
          type: 'array',
          required: true,
          itemFields: [
            {
              name: 'fixture_type',
              label: 'Fixture type',
              description: 'Shelf, endcap, cooler, rack, display, or other fixture type.',
              type: 'string',
              required: true,
            },
            {
              name: 'product_or_brand',
              label: 'Product or brand',
              description: 'Visible product or brand name.',
              type: 'string',
              required: true,
            },
            {
              name: 'facing_count',
              label: 'Facing count',
              description: 'Number of visible product facings.',
              type: 'integer',
              required: true,
            },
            {
              name: 'stock_status',
              label: 'Stock status',
              description: 'Visible stock condition such as full, low, empty, or obstructed.',
              type: 'string',
              required: true,
            },
            {
              name: 'price_label_present',
              label: 'Price label present',
              description: 'Whether a corresponding price label is visible.',
              type: 'boolean',
              required: true,
            },
            {
              name: 'layout_compliant',
              label: 'Layout compliant',
              description: 'Whether the visible placement appears compliant with the requested layout.',
              type: 'boolean',
              required: true,
            },
          ],
        },
        {
          name: 'promotional_signage_present',
          label: 'Promotional signage present',
          description: 'Whether promotional signage is visible in the audited area.',
          type: 'boolean',
          required: false,
        },
        {
          name: 'blocked_aisle',
          label: 'Blocked aisle',
          description: 'Whether products, equipment, or fixtures visibly obstruct the aisle.',
          type: 'boolean',
          required: true,
        },
        {
          name: 'compliance_summary',
          label: 'Compliance summary',
          description: 'Concise summary of visible layout issues, missing labels, gaps, or placement problems.',
          type: 'string',
          required: true,
        },
      ],
    },
  },
  {
    displayName: 'Room chair count',
    slug: 'room_chair_count',
    description: 'Room inventory with visible chair, occupancy, table, accessibility, and exit-safety counts.',
    captureGuide: 'none',
    prompt:
      'Room photo with total chairs, occupied chairs, tables, accessible seating, blocked exits, room name, and visible notes.',
    contract: {
      documentIntent:
        'A room or event-space photograph used to count seating and identify basic occupancy or safety conditions.',
      extractionInstructions:
        'Count only clearly visible chairs and tables. Do not estimate objects outside the frame or hidden behind people. Note occlusion when it affects the count.',
      fields: [
        {
          name: 'total_chairs',
          label: 'Total chairs',
          description: 'Number of clearly visible chairs in the image.',
          type: 'integer',
          required: true,
        },
        {
          name: 'occupied_chairs',
          label: 'Occupied chairs',
          description: 'Number of visible chairs occupied by a person or object.',
          type: 'integer',
          required: false,
        },
        {
          name: 'tables',
          label: 'Tables',
          description: 'Number of clearly visible tables.',
          type: 'integer',
          required: false,
        },
        {
          name: 'accessible_seating',
          label: 'Accessible seating',
          description: 'Number of visible designated accessible seating positions.',
          type: 'integer',
          required: false,
        },
        {
          name: 'blocked_exits',
          label: 'Blocked exits',
          description: 'Whether any visible exit or egress path appears blocked.',
          type: 'boolean',
          required: true,
        },
        {
          name: 'room_name',
          label: 'Room name',
          description: 'Room name or identifier when visible.',
          type: 'string',
          required: false,
        },
        {
          name: 'notes',
          label: 'Notes',
          description: 'Visible conditions or occlusions that affect the count.',
          type: 'string',
          required: false,
        },
      ],
    },
  },
];
