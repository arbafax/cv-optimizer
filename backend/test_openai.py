#!/usr/bin/env python3
"""
Test script to verify OpenAI API connectivity and model availability
"""
import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from openai import OpenAI
from app.core.config import settings

def test_openai_connection():
    """Test basic OpenAI API connection"""
    print("=" * 60)
    print("Testing OpenAI API Connection")
    print("=" * 60)
    
    # Check if API key is set
    print(f"\n1. API Key configured: {'Yes' if settings.OPENAI_API_KEY else 'No'}")
    if not settings.OPENAI_API_KEY:
        print("   ❌ ERROR: OPENAI_API_KEY not found in .env")
        return False
    
    # Mask API key for display
    masked_key = settings.OPENAI_API_KEY[:10] + "..." + settings.OPENAI_API_KEY[-4:]
    print(f"   Key: {masked_key}")
    
    try:
        # Initialize client
        client = OpenAI(api_key=settings.OPENAI_API_KEY)
        print("\n2. OpenAI client initialized: ✅")
        
        # Test simple completion
        print("\n3. Testing chat completion...")
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "user", "content": "Say 'API test successful' and nothing else."}
            ],
            max_tokens=10
        )
        
        result = response.choices[0].message.content
        print(f"   Response: {result}")
        print("   ✅ Chat completion works!")
        
        # Test embeddings
        print("\n4. Testing embeddings...")
        embed_response = client.embeddings.create(
            model=settings.EMBEDDING_MODEL,
            input="Test text for embedding"
        )
        
        embedding = embed_response.data[0].embedding
        print(f"   Embedding dimensions: {len(embedding)}")
        print(f"   Expected dimensions: {settings.EMBEDDING_DIMENSION}")
        
        if len(embedding) == settings.EMBEDDING_DIMENSION:
            print("   ✅ Embeddings work!")
        else:
            print("   ⚠️  Warning: Dimension mismatch")
        
        # Test JSON mode
        print("\n5. Testing JSON response format...")
        json_response = client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "user", "content": "Return this JSON: {\"test\": \"success\"}"}
            ],
            response_format={"type": "json_object"}
        )
        
        json_result = json_response.choices[0].message.content
        print(f"   Response: {json_result}")
        print("   ✅ JSON mode works!")
        
        print("\n" + "=" * 60)
        print("✅ ALL TESTS PASSED!")
        print("=" * 60)
        print("\nYour OpenAI API is properly configured and working.")
        return True
        
    except Exception as e:
        print(f"\n❌ ERROR: {str(e)}")
        print("\nPossible issues:")
        print("- Invalid API key")
        print("- No credits remaining on OpenAI account")
        print("- Model 'gpt-4o' not available (try 'gpt-3.5-turbo' instead)")
        print("- Network connectivity issues")
        return False

if __name__ == "__main__":
    success = test_openai_connection()
    sys.exit(0 if success else 1)
