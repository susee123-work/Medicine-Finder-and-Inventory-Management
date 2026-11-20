const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

export const getStoredToken = () => localStorage.getItem('medipulse_token');
export const setStoredToken = (token) => localStorage.setItem('medipulse_token', token);
export const getStoredUser = () => {
  const u = localStorage.getItem('medipulse_user');
  return u ? JSON.parse(u) : null;
};
export const setStoredUser = (user) => localStorage.setItem('medipulse_user', JSON.stringify(user));
export const clearAuth = () => {
  localStorage.removeItem('medipulse_token');
  localStorage.removeItem('medipulse_user');
};

async function request(endpoint, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  const token = getStoredToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers
  });

  if (!res.ok) {
    let errMessage = `Error ${res.status}: ${res.statusText}`;
    try {
      const errJson = await res.json();
      errMessage = errJson.detail || errMessage;
    } catch {
      // ignore
    }
    throw new Error(errMessage);
  }

  return res.json();
}

export const api = {
  // Auth & Roles
  auth: {
    login: (creds) => request('/auth/login', { method: 'POST', body: JSON.stringify(creds) }),
    portalLogin: (portalKey, creds) => request(`/auth/login/${portalKey}`, { method: 'POST', body: JSON.stringify(creds) }),
    register: (data) => request('/auth/register', { method: 'POST', body: JSON.stringify(data) }),
    requestOtp: (data) => request('/auth/otp/request', { method: 'POST', body: JSON.stringify(data) }),
    verifyOtp: (data) => request('/auth/otp/verify', { method: 'POST', body: JSON.stringify(data) }),
    portalStats: () => request('/auth/portal-stats'),
    me: () => request('/auth/me'),
    getDemoTokens: () => request('/auth/demo-tokens')
  },

  // Inventory & Sales
  inventory: {
    list: (pharmacyId) => request(`/inventory?pharmacy_id=${pharmacyId}`),
    upsert: (stock) => request('/inventory', { method: 'POST', body: JSON.stringify(stock) }),
    bulkUpload: (bulk) => request('/inventory/bulk', { method: 'POST', body: JSON.stringify(bulk) }),
    verify: (batchId) => request(`/inventory/verify/${batchId}`, { method: 'PATCH' }),
    expiring: (pharmacyId, days = 60) => request(`/inventory/expiring?pharmacy_id=${pharmacyId}&days=${days}`),
    recordSale: (sale) => request('/sales', { method: 'POST', body: JSON.stringify(sale) }),
    deliveries: (pharmacyId) => request(`/deliveries${pharmacyId ? `?pharmacy_id=${pharmacyId}` : ''}`),
    receiveDelivery: (deliveryId, data) =>
      request(`/deliveries/${deliveryId}/receive?quantity_received=${data.quantity_received}&batch_no=${encodeURIComponent(data.batch_no)}&expiry_date=${data.expiry_date}`, { method: 'PATCH' })
  },

  // Pharmacies & Medicines
  pharmacies: {
    list: () => request('/pharmacies'),
    create: (data) => request('/pharmacies', { method: 'POST', body: JSON.stringify(data) })
  },
  medicines: {
    list: () => request('/medicines')
  },
  suppliers: {
    list: () => request('/suppliers')
  },

  // Predictive Engine (Module 2)
  predictions: {
    shortages: (pharmacyId, horizon = 7) => request(`/predictions/shortages?pharmacy_id=${pharmacyId}&horizon_days=${horizon}`),
    detail: (medicineId, pharmacyId, horizon = 7) => request(`/predictions/detail/${medicineId}?pharmacy_id=${pharmacyId}&horizon_days=${horizon}`)
  },

  // Patient Finder & Confirmations (Module 3)
  finder: {
    search: (medicine, lat, lng, openNow = false, inStockOnly = true) => {
      let q = `/finder?medicine=${encodeURIComponent(medicine)}&open_now=${openNow}&in_stock_only=${inStockOnly}`;
      if (lat != null && lng != null) q += `&lat=${lat}&lng=${lng}`;
      return request(q);
    },
    confirm: (data) => request('/finder/confirm', { method: 'POST', body: JSON.stringify(data) }),
    checkStatus: (requestId) => request(`/finder/confirm/${requestId}`),
    pharmacyRequests: (pharmacyId) => request(`/finder/pharmacy-requests?pharmacy_id=${pharmacyId}`),
    respondRequest: (requestId, data) => request(`/finder/pharmacy-requests/${requestId}`, { method: 'PATCH', body: JSON.stringify(data) })
  },

  // Community Analytics (Module 4)
  community: {
    get: () => request('/analytics/community')
  },

  // Data Warehouse & OLAP Explorer
  olap: {
    query: (config) => request('/analytics/olap/query', { method: 'POST', body: JSON.stringify(config) }),
    cube: () => request('/analytics/olap/cube'),
    runEtl: () => request('/analytics/olap/etl/run', { method: 'POST' }),
    etlHistory: () => request('/analytics/olap/etl/history'),
    savedViews: () => request('/analytics/olap/saved-views'),
    saveView: (view) => request('/analytics/olap/saved-views', { method: 'POST', body: JSON.stringify(view) }),
    schemaMetadata: () => request('/analytics/olap/schema-metadata'),
    snowflakeHierarchies: () => request('/analytics/olap/snowflake-hierarchies'),
    cube3d: () => request('/analytics/olap/cube-3d'),
    pivotMatrix: (rowDim = 'therapeutic_category', colDim = 'quarter_name', measure = 'revenue', schemaType = 'star') =>
      request(`/analytics/olap/pivot-matrix?row_dim=${rowDim}&col_dim=${colDim}&measure=${measure}&schema_type=${schemaType}`)
  },

  // Data Mining Studio
  mining: {
    associationRules: (minSupp = 0.02, minConf = 0.20) => request(`/analytics/mining/association-rules?min_support=${minSupp}&min_confidence=${minConf}`),
    demandSurges: () => request('/analytics/mining/demand-surges'),
    pharmacyClusters: (k = 3) => request(`/analytics/mining/pharmacy-clusters?k=${k}`),
    supplierScores: () => request('/analytics/mining/supplier-scores'),
    retrain: () => request('/analytics/mining/retrain', { method: 'POST' }),
    modelRegistry: () => request('/analytics/mining/model-registry')
  },

  // Alerts & Subscriptions
  alerts: {
    subscribe: (sub) => request('/alerts/subscribe', { method: 'POST', body: JSON.stringify(sub) }),
    subscriptions: () => request('/alerts/subscriptions'),
    previewDigest: (pharmacyId) => request(`/alerts/digest/preview?pharmacy_id=${pharmacyId}`),
    sendDigest: (pharmacyId, toEmail) => {
      let q = `/alerts/digest/send?pharmacy_id=${pharmacyId}`;
      if (toEmail && toEmail.trim()) q += `&to_email=${encodeURIComponent(toEmail.trim())}`;
      return request(q, { method: 'POST' });
    }
  },

  // SMTP Email Diagnostics
  email: {
    status: () => request('/email/status'),
    test: (to) => request(`/email/test?to=${encodeURIComponent(to)}`, { method: 'POST' })
  },

  // Monitoring
  monitoring: {
    health: () => request('/health')
  }
};

