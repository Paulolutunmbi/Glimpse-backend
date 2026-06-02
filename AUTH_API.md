# Glimpse Auth API

Base URL: `${API_BASE_URL}/api/auth`

## Endpoints

- `POST /register` or `POST /signup`
- `POST /login`
- `POST /forgot-password`

## Axios Examples

```js
await API.post('/api/auth/register', {
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  password: 'Password123',
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
  username: 'ada',
  email: 'ada@example.com',
  newPassword: 'NewPassword123',
});
```

## Fetch Examples

```js
await fetch(`${API_BASE_URL}/api/auth/register`, {
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
await fetch(`${API_BASE_URL}/api/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'ada@example.com',
    password: 'Password123',
  }),
});
```
