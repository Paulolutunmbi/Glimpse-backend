# Glimpse Auth API

Base URL: `http://localhost:5000/api/auth`

## Endpoints

- `POST /register` or `POST /signup`
- `POST /verify` or `POST /verify-email`
- `POST /resend-verification`
- `POST /login`
- `POST /forgot-password`
- `POST /reset-password`

## Axios Examples

```js
await API.post('/api/auth/register', {
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  password: 'Password123',
});
```

```js
await API.post('/api/auth/verify', {
  email: 'ada@example.com',
  code: '123456',
});
```

```js
const { data } = await API.post('/api/auth/login', {
  email: 'ada@example.com',
  password: 'Password123',
});

localStorage.setItem('token', data.token);
```

```js
await API.post('/api/auth/forgot-password', {
  email: 'ada@example.com',
});
```

```js
await API.post('/api/auth/reset-password', {
  token: new URLSearchParams(window.location.search).get('token'),
  newPassword: 'NewPassword123',
});
```

## Fetch Examples

```js
await fetch('http://localhost:5000/api/auth/register', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    password: 'Password123',
  }),
});
```

```js
await fetch('http://localhost:5000/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'ada@example.com',
    password: 'Password123',
  }),
});
```
