import client from 'prom-client';

client.collectDefaultMetrics({ prefix: 'amrutam_' });

export const httpRequestDurationMicroseconds = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.01, 0.05, 0.1, 0.2, 0.5, 1, 2, 5],
});

export const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests processed',
  labelNames: ['method', 'route', 'status_code'],
});

export const activeConsultationsGauge = new client.Gauge({
  name: 'active_consultations_total',
  help: 'Number of consultations currently in progress',
});

export const consultationBookingsCounter = new client.Counter({
  name: 'consultations_booked_total',
  help: 'Total consultation booking attempts',
  labelNames: ['status'],
});

export function metricsMiddleware(req, res, next) {
  const start = process.hrtime();

  res.on('finish', () => {
    const diff = process.hrtime(start);
    const durationInSeconds = diff[0] + diff[1] / 1e9;
    const route = req.route ? req.baseUrl + req.route.path : req.path;

    httpRequestDurationMicroseconds
      .labels(req.method, route, res.statusCode)
      .observe(durationInSeconds);

    httpRequestsTotal
      .labels(req.method, route, res.statusCode)
      .inc();
  });

  next();
}

export async function getMetricsHandler(req, res) {
  res.setHeader('Content-Type', client.register.contentType);
  const metrics = await client.register.metrics();
  res.send(metrics);
}

export default {
  metricsMiddleware,
  getMetricsHandler,
  activeConsultationsGauge,
  consultationBookingsCounter,
};

