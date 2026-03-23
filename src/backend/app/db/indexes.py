from motor.motor_asyncio import AsyncIOMotorDatabase
import pymongo


async def create_all_indexes(db: AsyncIOMotorDatabase):
    """Create indexes for all collections for query performance."""

    index_definitions = {
        "sales_order_headers": [
            ([("salesOrder", 1)], {"unique": True}),
            ([("soldToParty", 1)], {}),
        ],
        "sales_order_items": [
            ([("salesOrder", 1), ("salesOrderItem", 1)], {"unique": True}),
            ([("material", 1)], {}),
            ([("productionPlant", 1)], {}),
        ],
        "sales_order_schedule_lines": [
            ([("salesOrder", 1), ("salesOrderItem", 1), ("scheduleLine", 1)], {"unique": True}),
        ],
        "outbound_delivery_headers": [
            ([("deliveryDocument", 1)], {"unique": True}),
        ],
        "outbound_delivery_items": [
            ([("deliveryDocument", 1), ("deliveryDocumentItem", 1)], {"unique": True}),
            ([("referenceSdDocument", 1)], {}),
        ],
        "billing_document_headers": [
            ([("billingDocument", 1)], {"unique": True}),
            ([("accountingDocument", 1)], {}),
            ([("soldToParty", 1)], {}),
        ],
        "billing_document_items": [
            ([("billingDocument", 1), ("billingDocumentItem", 1)], {"unique": True}),
            ([("referenceSdDocument", 1)], {}),
            ([("material", 1)], {}),
        ],
        "billing_document_cancellations": [
            ([("billingDocument", 1)], {"unique": True}),
        ],
        "journal_entry_items_accounts_receivable": [
            ([("accountingDocument", 1)], {}),
            ([("referenceDocument", 1)], {}),
            ([("customer", 1)], {}),
            ([("clearingAccountingDocument", 1)], {}),
        ],
        "payments_accounts_receivable": [
            ([("accountingDocument", 1)], {}),
            ([("customer", 1)], {}),
        ],
        "business_partners": [
            ([("businessPartner", 1)], {"unique": True}),
        ],
        "business_partner_addresses": [
            ([("businessPartner", 1)], {}),
        ],
        "customer_company_assignments": [
            ([("customer", 1), ("companyCode", 1)], {"unique": True}),
        ],
        "customer_sales_area_assignments": [
            ([("customer", 1)], {}),
        ],
        "plants": [
            ([("plant", 1)], {"unique": True}),
        ],
        "products": [
            ([("product", 1)], {"unique": True}),
        ],
        "product_descriptions": [
            ([("product", 1), ("language", 1)], {}),
        ],
        "product_plants": [
            ([("product", 1), ("plant", 1)], {"unique": True}),
        ],
        "product_storage_locations": [
            ([("product", 1), ("plant", 1), ("storageLocation", 1)], {"unique": True}),
        ],
        # Graph collections
        "nodes": [
            ([("id", 1)], {"unique": True}),
            ([("type", 1)], {}),
        ],
        "edges": [
            ([("source", 1)], {}),
            ([("target", 1)], {}),
            ([("type", 1)], {}),
        ],
    }

    for collection_name, indexes in index_definitions.items():
        collection = db[collection_name]
        for index_keys, options in indexes:
            try:
                await collection.create_index(index_keys, **options)
            except pymongo.errors.OperationFailure:
                # Index might already exist with different options
                pass
