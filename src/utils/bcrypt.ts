
import bcrypt from 'bcryptjs';


const SALT_ROUNDS = parseInt('12');

const hashPassword = async (password: string): Promise<string> => {
    
    if (!password || typeof password !== 'string') {
        throw new Error('Password must be a non-empty string');
    }
    
    try {
        const salt = await bcrypt.genSalt(SALT_ROUNDS);
        const hashedPassword = await bcrypt.hash(password, salt);
        return hashedPassword;
    } catch (error) {
        throw new Error('Failed to hash password');
    }
}

const comparePassword = async (password: string, hashedPassword: string): Promise<boolean> => {
    if (!password || typeof password !== 'string') {
        return false;
    }
    
    if (!hashedPassword || typeof hashedPassword !== 'string') {
        return false;
    }
    
    try {
        const isMatch = await bcrypt.compare(password, hashedPassword);
        return isMatch;
    } catch (error) {
        console.error('Password comparison failed:', error);
        return false;
    }
}

export { hashPassword, comparePassword };