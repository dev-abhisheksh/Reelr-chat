import mongoose from "mongoose";

const messageSchema = new mongoose.Schema({
    conversationId: {
        type: String,
        ref: "Conversation",
        required: true
    },
    sender: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    text: {
        type: String,
        required: true
    },
    seen: {
        type: Boolean,
        default: false
    }
}, { timestamps: true })

export default mongoose.model("Message", messageSchema);