import request from 'supertest';
import app from '../index'; // assuming your express app is exported from index.ts

describe('Auth Routes', () => {
  it('should signup a new user', async () => {
    const response = await request(app).post('/auth/signup').send({
      username: 'testuser',
      password: 'password123'
    });
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('userId');
    expect(response.body.username).toBe('testuser');
  });

  it('should signin an existing user', async () => {
    await request(app).post('/auth/signup').send({
      username: 'testuser',
      password: 'password123'
    });

    const response = await request(app).post('/auth/signin').send({
      username: 'testuser',
      password: 'password123'
    });
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('token');
  });

  it('should sign in with Google', async () => {
    const response = await request(app).post('/auth/google-signin').send({
      token: 'fake-google-id-token'
    });
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('token');
  });
});