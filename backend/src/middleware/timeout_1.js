// Ensures no request can hang forever. If nothing has sent a response by
// `ms`, we return our own structured 504 instead of letting the platform's
// gateway (Render) time out with an opaque error.
export function requestTimeout(ms) {
  return (req, res, next) => {
    res.setTimeout(ms, () => {
      if (!res.headersSent) {
        res.status(504).json({
          error: {
            code: "REQUEST_TIMEOUT",
            message: `Request exceeded ${ms}ms without completing.`,
            provider: null,
            model: null,
            detail: null,
          },
        });
      }
    });
    next();
  };
}
