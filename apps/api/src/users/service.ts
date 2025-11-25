import { injectable } from 'tsyringe';
import { UserRepository } from './repository';
import { Logger } from '@crm/shared';
import type { User, NewUser } from './schema';

@injectable()
export class UserService {
  constructor(
    private userRepository: UserRepository,
    private logger: Logger
  ) {}

  async getAllUsers(): Promise<User[]> {
    this.logger.info('Fetching all users');
    return this.userRepository.findAll();
  }

  async getUserById(id: string): Promise<User | undefined> {
    this.logger.info(`Fetching user with id: ${id}`);
    return this.userRepository.findById(id);
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    this.logger.info(`Fetching user with email: ${email}`);
    return this.userRepository.findByEmail(email);
  }

  async createUser(data: NewUser): Promise<User> {
    this.logger.info(`Creating user with email: ${data.email}`);
    return this.userRepository.create(data);
  }

  async updateUser(id: string, data: Partial<NewUser>): Promise<User | undefined> {
    this.logger.info(`Updating user with id: ${id}`);
    return this.userRepository.update(id, data);
  }

  async deleteUser(id: string): Promise<boolean> {
    this.logger.info(`Deleting user with id: ${id}`);
    return this.userRepository.delete(id);
  }
}
