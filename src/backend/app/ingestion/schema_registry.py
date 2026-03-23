"""
Schema Registry — single source of truth for entity types, primary keys,
node ID templates, and FK relationships. Every other module depends on this.
"""

ENTITY_REGISTRY = {
    "sales_order_headers": {
        "node_type": "sales_order",
        "pk_fields": ["salesOrder"],
        "node_id_template": "sales_order::{salesOrder}",
        "label_template": "SO {salesOrder}",
        "display_fields": [
            "salesOrder", "soldToParty", "totalNetAmount",
            "transactionCurrency", "creationDate",
            "overallDeliveryStatus", "overallOrdReltdBillgStatus",
        ],
    },
    "sales_order_items": {
        "node_type": "sales_order_item",
        "pk_fields": ["salesOrder", "salesOrderItem"],
        "node_id_template": "so_item::{salesOrder}-{salesOrderItem}",
        "label_template": "SO Item {salesOrder}-{salesOrderItem}",
        "display_fields": [
            "salesOrder", "salesOrderItem", "material",
            "requestedQuantity", "netAmount", "productionPlant",
        ],
    },
    "sales_order_schedule_lines": {
        "node_type": "schedule_line",
        "pk_fields": ["salesOrder", "salesOrderItem", "scheduleLine"],
        "node_id_template": "sched::{salesOrder}-{salesOrderItem}-{scheduleLine}",
        "label_template": "Schedule {salesOrder}-{salesOrderItem}-{scheduleLine}",
        "display_fields": [
            "salesOrder", "salesOrderItem", "scheduleLine",
            "confirmedDeliveryDate", "confdOrderQtyByMatlAvailCheck",
        ],
    },
    "outbound_delivery_headers": {
        "node_type": "delivery",
        "pk_fields": ["deliveryDocument"],
        "node_id_template": "delivery::{deliveryDocument}",
        "label_template": "Del {deliveryDocument}",
        "display_fields": [
            "deliveryDocument", "creationDate", "shippingPoint",
            "overallGoodsMovementStatus", "overallPickingStatus",
        ],
    },
    "outbound_delivery_items": {
        "node_type": "delivery_item",
        "pk_fields": ["deliveryDocument", "deliveryDocumentItem"],
        "node_id_template": "del_item::{deliveryDocument}-{deliveryDocumentItem}",
        "label_template": "Del Item {deliveryDocument}-{deliveryDocumentItem}",
        "display_fields": [
            "deliveryDocument", "deliveryDocumentItem",
            "actualDeliveryQuantity", "plant",
            "referenceSdDocument", "referenceSdDocumentItem",
        ],
    },
    "billing_document_headers": {
        "node_type": "billing_document",
        "pk_fields": ["billingDocument"],
        "node_id_template": "billing::{billingDocument}",
        "label_template": "Bill {billingDocument}",
        "display_fields": [
            "billingDocument", "billingDocumentType", "creationDate",
            "totalNetAmount", "transactionCurrency", "soldToParty",
            "accountingDocument", "billingDocumentIsCancelled",
        ],
    },
    "billing_document_items": {
        "node_type": "billing_item",
        "pk_fields": ["billingDocument", "billingDocumentItem"],
        "node_id_template": "bill_item::{billingDocument}-{billingDocumentItem}",
        "label_template": "Bill Item {billingDocument}-{billingDocumentItem}",
        "display_fields": [
            "billingDocument", "billingDocumentItem", "material",
            "billingQuantity", "netAmount",
            "referenceSdDocument", "referenceSdDocumentItem",
        ],
    },
    "billing_document_cancellations": {
        "node_type": "billing_cancellation",
        "pk_fields": ["billingDocument"],
        "node_id_template": "bill_cancel::{billingDocument}",
        "label_template": "Cancel {billingDocument}",
        "display_fields": [
            "billingDocument", "billingDocumentType", "creationDate",
            "cancelledBillingDocument", "totalNetAmount", "soldToParty",
        ],
    },
    "journal_entry_items_accounts_receivable": {
        "node_type": "journal_entry",
        "pk_fields": ["companyCode", "fiscalYear", "accountingDocument"],
        "node_id_template": "journal::{companyCode}-{fiscalYear}-{accountingDocument}",
        "label_template": "JE {accountingDocument}",
        "display_fields": [
            "companyCode", "fiscalYear", "accountingDocument",
            "referenceDocument", "customer", "glAccount",
            "amountInTransactionCurrency", "transactionCurrency",
            "postingDate", "accountingDocumentType",
        ],
        "deduplicate_by": ["companyCode", "fiscalYear", "accountingDocument"],
    },
    "payments_accounts_receivable": {
        "node_type": "payment",
        "pk_fields": ["companyCode", "fiscalYear", "accountingDocument"],
        "node_id_template": "payment::{companyCode}-{fiscalYear}-{accountingDocument}",
        "label_template": "Pay {accountingDocument}",
        "display_fields": [
            "companyCode", "fiscalYear", "accountingDocument",
            "customer", "amountInTransactionCurrency",
            "transactionCurrency", "postingDate",
            "clearingAccountingDocument",
        ],
        "deduplicate_by": ["companyCode", "fiscalYear", "accountingDocument"],
    },
    "business_partners": {
        "node_type": "customer",
        "pk_fields": ["businessPartner"],
        "node_id_template": "customer::{businessPartner}",
        "label_template": "{businessPartnerFullName}",
        "display_fields": [
            "businessPartner", "businessPartnerFullName",
            "businessPartnerCategory", "industry",
            "creationDate",
        ],
    },
    "business_partner_addresses": {
        "node_type": "address",
        "pk_fields": ["businessPartner", "addressId"],
        "node_id_template": "address::{businessPartner}-{addressId}",
        "label_template": "Addr {businessPartner}-{addressId}",
        "display_fields": [
            "businessPartner", "addressId", "cityName",
            "country", "region", "postalCode", "streetName",
        ],
    },
    "customer_company_assignments": {
        "node_type": "customer_company",
        "pk_fields": ["customer", "companyCode"],
        "node_id_template": "cust_co::{customer}-{companyCode}",
        "label_template": "CustCo {customer}-{companyCode}",
        "display_fields": [
            "customer", "companyCode", "paymentTerms",
            "reconciliationAccount",
        ],
    },
    "customer_sales_area_assignments": {
        "node_type": "customer_sales_area",
        "pk_fields": ["customer", "salesOrganization", "distributionChannel", "division"],
        "node_id_template": "cust_sa::{customer}-{salesOrganization}-{distributionChannel}-{division}",
        "label_template": "CustSA {customer}",
        "display_fields": [
            "customer", "salesOrganization", "distributionChannel",
            "division", "currency", "customerPaymentTerms",
        ],
    },
    "plants": {
        "node_type": "plant",
        "pk_fields": ["plant"],
        "node_id_template": "plant::{plant}",
        "label_template": "{plantName}",
        "display_fields": [
            "plant", "plantName", "salesOrganization",
        ],
    },
    "products": {
        "node_type": "product",
        "pk_fields": ["product"],
        "node_id_template": "product::{product}",
        "label_template": "Prod {product}",
        "display_fields": [
            "product", "productType", "productGroup",
            "baseUnit", "grossWeight", "weightUnit",
        ],
    },
    "product_descriptions": {
        "node_type": "product_description",
        "pk_fields": ["product", "language"],
        "node_id_template": "prod_desc::{product}-{language}",
        "label_template": "{productDescription}",
        "display_fields": [
            "product", "language", "productDescription",
        ],
    },
    "product_plants": {
        "node_type": "product_plant",
        "pk_fields": ["product", "plant"],
        "node_id_template": "prod_plant::{product}-{plant}",
        "label_template": "ProdPlant {product}-{plant}",
        "display_fields": [
            "product", "plant", "profitCenter",
        ],
        "lazy": True,
    },
    "product_storage_locations": {
        "node_type": "product_storage",
        "pk_fields": ["product", "plant", "storageLocation"],
        "node_id_template": "prod_stor::{product}-{plant}-{storageLocation}",
        "label_template": "Storage {product}-{plant}-{storageLocation}",
        "display_fields": [
            "product", "plant", "storageLocation",
        ],
        "lazy": True,
    },
}

# Relationships define edges between entity types.
# Each entry specifies source/target collections and the FK join fields.
RELATIONSHIP_REGISTRY = [
    # Sales Order -> Items
    {
        "type": "HAS_ITEM",
        "source_collection": "sales_order_headers",
        "target_collection": "sales_order_items",
        "join": {"source_field": "salesOrder", "target_field": "salesOrder"},
    },
    # Sales Order Item -> Schedule Lines
    {
        "type": "HAS_SCHEDULE",
        "source_collection": "sales_order_items",
        "target_collection": "sales_order_schedule_lines",
        "join": {
            "source_field": ["salesOrder", "salesOrderItem"],
            "target_field": ["salesOrder", "salesOrderItem"],
        },
    },
    # Sales Order -> Customer (soldToParty)
    {
        "type": "ORDERED_BY",
        "source_collection": "sales_order_headers",
        "target_collection": "business_partners",
        "join": {"source_field": "soldToParty", "target_field": "businessPartner"},
    },
    # Sales Order Item -> Product
    {
        "type": "CONTAINS_PRODUCT",
        "source_collection": "sales_order_items",
        "target_collection": "products",
        "join": {"source_field": "material", "target_field": "product"},
    },
    # Sales Order Item -> Plant
    {
        "type": "PRODUCED_AT",
        "source_collection": "sales_order_items",
        "target_collection": "plants",
        "join": {"source_field": "productionPlant", "target_field": "plant"},
    },
    # Delivery -> Delivery Items
    {
        "type": "HAS_DEL_ITEM",
        "source_collection": "outbound_delivery_headers",
        "target_collection": "outbound_delivery_items",
        "join": {"source_field": "deliveryDocument", "target_field": "deliveryDocument"},
    },
    # Delivery Item -> Sales Order (referenceSdDocument)
    {
        "type": "DELIVERS_ORDER",
        "source_collection": "outbound_delivery_items",
        "target_collection": "sales_order_headers",
        "join": {"source_field": "referenceSdDocument", "target_field": "salesOrder"},
    },
    # Delivery Item -> Plant
    {
        "type": "SHIPPED_FROM",
        "source_collection": "outbound_delivery_items",
        "target_collection": "plants",
        "join": {"source_field": "plant", "target_field": "plant"},
    },
    # Billing Document -> Billing Items
    {
        "type": "HAS_BILL_ITEM",
        "source_collection": "billing_document_headers",
        "target_collection": "billing_document_items",
        "join": {"source_field": "billingDocument", "target_field": "billingDocument"},
    },
    # Billing Item -> Delivery (referenceSdDocument)
    {
        "type": "BILLS_DELIVERY",
        "source_collection": "billing_document_items",
        "target_collection": "outbound_delivery_headers",
        "join": {"source_field": "referenceSdDocument", "target_field": "deliveryDocument"},
    },
    # Billing Item -> Product
    {
        "type": "BILLS_PRODUCT",
        "source_collection": "billing_document_items",
        "target_collection": "products",
        "join": {"source_field": "material", "target_field": "product"},
    },
    # Billing Document -> Customer
    {
        "type": "BILLED_TO",
        "source_collection": "billing_document_headers",
        "target_collection": "business_partners",
        "join": {"source_field": "soldToParty", "target_field": "businessPartner"},
    },
    # Billing Document -> Journal Entry (via accountingDocument)
    {
        "type": "GENERATES_JE",
        "source_collection": "billing_document_headers",
        "target_collection": "journal_entry_items_accounts_receivable",
        "join": {"source_field": "accountingDocument", "target_field": "accountingDocument"},
    },
    # Billing Cancellation -> Original Billing Document
    {
        "type": "CANCELS",
        "source_collection": "billing_document_cancellations",
        "target_collection": "billing_document_headers",
        "join": {"source_field": "cancelledBillingDocument", "target_field": "billingDocument"},
    },
    # Journal Entry -> Customer
    {
        "type": "JE_FOR_CUSTOMER",
        "source_collection": "journal_entry_items_accounts_receivable",
        "target_collection": "business_partners",
        "join": {"source_field": "customer", "target_field": "businessPartner"},
    },
    # Journal Entry -> Payment (same accountingDocument)
    {
        "type": "CLEARED_BY",
        "source_collection": "journal_entry_items_accounts_receivable",
        "target_collection": "payments_accounts_receivable",
        "join": {"source_field": "clearingAccountingDocument", "target_field": "accountingDocument"},
    },
    # Payment -> Customer
    {
        "type": "PAID_BY",
        "source_collection": "payments_accounts_receivable",
        "target_collection": "business_partners",
        "join": {"source_field": "customer", "target_field": "businessPartner"},
    },
    # Business Partner -> Address
    {
        "type": "HAS_ADDRESS",
        "source_collection": "business_partners",
        "target_collection": "business_partner_addresses",
        "join": {"source_field": "businessPartner", "target_field": "businessPartner"},
    },
    # Business Partner -> Company Assignments
    {
        "type": "HAS_COMPANY_ASSIGNMENT",
        "source_collection": "business_partners",
        "target_collection": "customer_company_assignments",
        "join": {"source_field": "businessPartner", "target_field": "customer"},
    },
    # Business Partner -> Sales Area Assignments
    {
        "type": "HAS_SALES_AREA",
        "source_collection": "business_partners",
        "target_collection": "customer_sales_area_assignments",
        "join": {"source_field": "businessPartner", "target_field": "customer"},
    },
    # Product -> Product Descriptions
    {
        "type": "DESCRIBED_AS",
        "source_collection": "products",
        "target_collection": "product_descriptions",
        "join": {"source_field": "product", "target_field": "product"},
    },
    # Product -> Product Plants
    {
        "type": "AVAILABLE_AT",
        "source_collection": "products",
        "target_collection": "product_plants",
        "join": {"source_field": "product", "target_field": "product"},
    },
    # Product Plant -> Plant
    {
        "type": "LOCATED_AT",
        "source_collection": "product_plants",
        "target_collection": "plants",
        "join": {"source_field": "plant", "target_field": "plant"},
    },
    # Product Plant -> Storage Locations
    {
        "type": "HAS_STORAGE",
        "source_collection": "product_plants",
        "target_collection": "product_storage_locations",
        "join": {
            "source_field": ["product", "plant"],
            "target_field": ["product", "plant"],
        },
    },
]

# Collections to skip in initial graph load (too many records)
LAZY_COLLECTIONS = {"product_plants", "product_storage_locations"}

# Node color mapping for frontend
NODE_COLORS = {
    "sales_order": "#3B82F6",
    "sales_order_item": "#60A5FA",
    "schedule_line": "#93C5FD",
    "delivery": "#10B981",
    "delivery_item": "#34D399",
    "billing_document": "#F59E0B",
    "billing_item": "#FBBF24",
    "billing_cancellation": "#EF4444",
    "journal_entry": "#8B5CF6",
    "payment": "#EC4899",
    "customer": "#06B6D4",
    "address": "#67E8F9",
    "customer_company": "#22D3EE",
    "customer_sales_area": "#A5F3FC",
    "plant": "#6B7280",
    "product": "#F97316",
    "product_description": "#FB923C",
    "product_plant": "#D1D5DB",
    "product_storage": "#E5E7EB",
}
