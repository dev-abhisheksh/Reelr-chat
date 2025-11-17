import mongoose from "mongoose";

const connectDB = async () => {
    try {
        const res = await mongoose.connect(process.env.MONGODB_URI);
        console.log(`MongoDB connected successful & Host ${res.connection.host}`);
    } catch (error) {
        console.error("Failed to connect to MongoDB", error.message);
        process.exit(1);
    }
};

export default connectDB;