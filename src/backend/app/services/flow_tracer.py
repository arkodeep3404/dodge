"""
O2C Flow Tracer: traces the full order-to-cash chain and detects broken flows.

Chain: Sales Order → Delivery → Billing → Journal Entry → Payment
"""
from motor.motor_asyncio import AsyncIOMotorDatabase


async def trace_order_flow(db: AsyncIOMotorDatabase, sales_order: str) -> dict:
    """Trace full O2C flow for a given sales order number."""
    result = {
        "sales_order": sales_order,
        "status": "unknown",
        "steps": {},
        "node_ids": [],
        "issues": [],
    }

    # 1. Get Sales Order Header
    so = await db["sales_order_headers"].find_one({"salesOrder": sales_order})
    if not so:
        result["status"] = "not_found"
        result["issues"].append(f"Sales order {sales_order} not found")
        return result

    so.pop("_id", None)
    result["steps"]["sales_order"] = so
    result["node_ids"].append(f"sales_order::{sales_order}")

    # 2. Get Sales Order Items
    items = []
    async for item in db["sales_order_items"].find({"salesOrder": sales_order}):
        item.pop("_id", None)
        items.append(item)
        result["node_ids"].append(f"so_item::{sales_order}-{item['salesOrderItem']}")
    result["steps"]["order_items"] = items

    # 3. Get Deliveries (via delivery items referencing this SO)
    delivery_docs = set()
    del_items = []
    async for di in db["outbound_delivery_items"].find({"referenceSdDocument": sales_order}):
        di.pop("_id", None)
        del_items.append(di)
        delivery_docs.add(di["deliveryDocument"])
        result["node_ids"].append(
            f"del_item::{di['deliveryDocument']}-{di['deliveryDocumentItem']}"
        )

    deliveries = []
    for dd in delivery_docs:
        dh = await db["outbound_delivery_headers"].find_one({"deliveryDocument": dd})
        if dh:
            dh.pop("_id", None)
            deliveries.append(dh)
            result["node_ids"].append(f"delivery::{dd}")
    result["steps"]["deliveries"] = deliveries
    result["steps"]["delivery_items"] = del_items

    if not deliveries:
        result["issues"].append("No deliveries found")

    # 4. Get Billing Documents (via billing items referencing delivery docs)
    billing_docs = set()
    bill_items = []
    for dd in delivery_docs:
        async for bi in db["billing_document_items"].find({"referenceSdDocument": dd}):
            bi.pop("_id", None)
            bill_items.append(bi)
            billing_docs.add(bi["billingDocument"])
            result["node_ids"].append(
                f"bill_item::{bi['billingDocument']}-{bi['billingDocumentItem']}"
            )

    billings = []
    for bd in billing_docs:
        bh = await db["billing_document_headers"].find_one({"billingDocument": bd})
        if bh:
            bh.pop("_id", None)
            billings.append(bh)
            result["node_ids"].append(f"billing::{bd}")
    result["steps"]["billings"] = billings
    result["steps"]["billing_items"] = bill_items

    if deliveries and not billings:
        result["issues"].append("Delivered but not billed")

    # 5. Get Journal Entries (via billing -> accountingDocument)
    journal_entries = []
    accounting_docs = set()
    for bh in billings:
        acct_doc = bh.get("accountingDocument")
        if acct_doc:
            async for je in db["journal_entry_items_accounts_receivable"].find(
                {"accountingDocument": acct_doc}
            ).limit(1):
                je.pop("_id", None)
                journal_entries.append(je)
                accounting_docs.add(acct_doc)
                result["node_ids"].append(
                    f"journal::{je.get('companyCode', '')}-{je.get('fiscalYear', '')}-{acct_doc}"
                )

    result["steps"]["journal_entries"] = journal_entries

    if billings and not journal_entries:
        result["issues"].append("Billed but no journal entries")

    # 6. Get Payments (via JE clearingAccountingDocument -> payment accountingDocument)
    payments = []
    for je in journal_entries:
        clearing_doc = je.get("clearingAccountingDocument")
        if clearing_doc:
            async for pay in db["payments_accounts_receivable"].find(
                {"accountingDocument": clearing_doc}
            ).limit(1):
                pay.pop("_id", None)
                payments.append(pay)
                result["node_ids"].append(
                    f"payment::{pay.get('companyCode', '')}-{pay.get('fiscalYear', '')}-{clearing_doc}"
                )

    result["steps"]["payments"] = payments

    if journal_entries and not payments:
        result["issues"].append("Journal entries exist but no payment clearing")

    # Determine overall status
    if not deliveries:
        result["status"] = "no_delivery"
    elif not billings:
        result["status"] = "no_billing"
    elif not journal_entries:
        result["status"] = "no_journal_entry"
    elif not payments:
        result["status"] = "no_payment"
    else:
        result["status"] = "complete"

    return result


async def find_broken_flows(
    db: AsyncIOMotorDatabase, break_type: str = "all"
) -> list:
    """Find sales orders with incomplete O2C chains."""
    broken = []

    async for so in db["sales_order_headers"].find():
        so_id = so["salesOrder"]
        flow = await trace_order_flow(db, so_id)

        if flow["status"] == "complete":
            continue

        if break_type == "all" or flow["status"] == break_type:
            broken.append({
                "salesOrder": so_id,
                "status": flow["status"],
                "issues": flow["issues"],
                "soldToParty": so.get("soldToParty"),
                "totalNetAmount": so.get("totalNetAmount"),
            })

    return broken


async def trace_billing_flow(db: AsyncIOMotorDatabase, billing_document: str) -> dict:
    """Trace flow starting from a billing document backwards and forwards."""
    result = {
        "billing_document": billing_document,
        "status": "unknown",
        "steps": {},
        "node_ids": [],
        "issues": [],
    }

    # Get billing header
    bh = await db["billing_document_headers"].find_one({"billingDocument": billing_document})
    if not bh:
        result["status"] = "not_found"
        result["issues"].append(f"Billing document {billing_document} not found")
        return result

    bh.pop("_id", None)
    result["steps"]["billing"] = bh
    result["node_ids"].append(f"billing::{billing_document}")

    # Get billing items -> find delivery references
    delivery_docs = set()
    async for bi in db["billing_document_items"].find({"billingDocument": billing_document}):
        bi.pop("_id", None)
        ref = bi.get("referenceSdDocument")
        if ref:
            delivery_docs.add(ref)

    # Get deliveries -> find sales order references
    sales_orders = set()
    for dd in delivery_docs:
        result["node_ids"].append(f"delivery::{dd}")
        async for di in db["outbound_delivery_items"].find({"deliveryDocument": dd}):
            ref = di.get("referenceSdDocument")
            if ref:
                sales_orders.add(ref)

    # Get sales orders
    for so_id in sales_orders:
        so = await db["sales_order_headers"].find_one({"salesOrder": so_id})
        if so:
            so.pop("_id", None)
            result["steps"].setdefault("sales_orders", []).append(so)
            result["node_ids"].append(f"sales_order::{so_id}")

    result["steps"]["deliveries"] = list(delivery_docs)

    # Forward: billing -> journal entry -> payment
    acct_doc = bh.get("accountingDocument")
    if acct_doc:
        async for je in db["journal_entry_items_accounts_receivable"].find(
            {"accountingDocument": acct_doc}
        ).limit(1):
            je.pop("_id", None)
            result["steps"]["journal_entry"] = je
            result["node_ids"].append(
                f"journal::{je.get('companyCode', '')}-{je.get('fiscalYear', '')}-{acct_doc}"
            )

            clearing = je.get("clearingAccountingDocument")
            if clearing:
                async for pay in db["payments_accounts_receivable"].find(
                    {"accountingDocument": clearing}
                ).limit(1):
                    pay.pop("_id", None)
                    result["steps"]["payment"] = pay
                    result["node_ids"].append(
                        f"payment::{pay.get('companyCode', '')}-{pay.get('fiscalYear', '')}-{clearing}"
                    )

    result["status"] = "traced"
    return result
