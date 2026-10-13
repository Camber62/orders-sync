const SOURCE_URL = process.env.ORDERS_URL || "https://test.ooobs.ru/api/orders";

export function normalizePhone(raw) {
  const digits = String(raw ?? "").replace(/\D/g, "");
  let normalized = digits;

  if (normalized.length === 11 && normalized.startsWith("8")) {
    normalized = `7${normalized.slice(1)}`;
  } else if (normalized.length === 10) {
    normalized = `7${normalized}`;
  }

  if (!/^7\d{10}$/.test(normalized)) return null;
  return `+${normalized}`;
}

function amountValue(value) {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : Number.NEGATIVE_INFINITY;
}

function timeValue(value) {
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : Number.NEGATIVE_INFINITY;
}

export function synchronize(orders) {
  const list = Array.isArray(orders) ? orders : [];
  const received = list.length;
  let invalidDropped = 0;
  const byPhone = new Map();

  for (const order of list) {
    const phone = normalizePhone(order?.phone);
    if (!phone) {
      invalidDropped += 1;
      continue;
    }

    const candidate = {
      name: order?.name ?? "",
      phone,
      email: order?.email ?? "",
      amount: amountValue(order?.amount),
      createdAt: timeValue(order?.created_at),
    };
    const current = byPhone.get(phone);

    if (!current) {
      byPhone.set(phone, candidate);
      continue;
    }

    const betterAmount = candidate.amount > current.amount;
    const sameAmountLater =
      candidate.amount === current.amount && candidate.createdAt > current.createdAt;

    if (betterAmount || sameAmountLater) {
      byPhone.set(phone, candidate);
    }
  }

  const clients = [...byPhone.values()]
    .map(({ name, phone, email, amount }) => ({ name, phone, email, amount }))
    .sort((a, b) => a.phone.localeCompare(b.phone));
  const unique = clients.length;

  return {
    clients,
    stats: {
      received,
      unique,
      duplicates_merged: received - invalidDropped - unique,
      invalid_dropped: invalidDropped,
    },
  };
}

export async function loadOrders(url = SOURCE_URL) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`upstream ${response.status}`);
  }

  const data = await response.json();
  if (!Array.isArray(data)) {
    throw new Error("upstream payload is not an array");
  }

  return data;
}

export async function buildResult() {
  return synchronize(await loadOrders());
}
