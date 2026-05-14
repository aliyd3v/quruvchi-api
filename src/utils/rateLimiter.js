const { RateLimiterMemory } = require("rate-limiter-flexible");

exports.rateLimiter = (points, duration, blockDuration) => {
  return new RateLimiterMemory({
    points,
    duration,
    blockDuration,
  });
};
