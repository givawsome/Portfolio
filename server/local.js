import app from './app.js';
app.listen(process.env.PORT || 3000, () =>
  console.log('Portfolio: http://localhost:' + (process.env.PORT || 3000) + ' | Admin: /admin/'),
);
