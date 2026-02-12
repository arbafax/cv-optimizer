#!/usr/bin/env python3
"""
Debug script to test CV structuring specifically
This simulates exactly what happens when you upload a CV
"""
import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from app.services.ai_service import AIService
from app.core.config import settings

# Sample CV text for testing
SAMPLE_CV_TEXT = """
Anna Andersson
anna.andersson@email.com
+46 70 123 45 67
Stockholm, Sverige

SAMMANFATTNING
Erfaren backend-utvecklare med 5+ års erfarenhet av Python och molnteknologier.
Specialist på att bygga skalbara API:er och microservices.

ARBETSLIVSERFARENHET

Senior Backend Developer
Tech AB, Stockholm
Jan 2020 - Nuvarande
- Byggde och underhöll RESTful API:er med FastAPI och Python
- Implementerade CI/CD pipelines med GitHub Actions
- Arbetade med PostgreSQL, Redis och Docker
- Teknologier: Python, FastAPI, PostgreSQL, Docker, AWS

Backend Developer
StartupCo, Stockholm
Jun 2018 - Dec 2019
- Utvecklade microservices-arkitektur
- Implementerade autentisering med OAuth2
- Teknologier: Python, Flask, MongoDB

UTBILDNING

Civilingenjör, Datateknik
KTH Royal Institute of Technology
2014 - 2018

KOMPETENSER
Python, FastAPI, Flask, PostgreSQL, MongoDB, Redis, Docker, Kubernetes, AWS, Git, CI/CD

SPRÅK
Svenska - Modersmål
Engelska - Flytande
"""

def test_cv_structuring():
    """Test the exact same flow as CV upload"""
    print("=" * 70)
    print("Testing CV Structuring (Same as Upload)")
    print("=" * 70)
    
    # Check settings
    print(f"\n1. OpenAI API Key: {'✅ Set' if settings.OPENAI_API_KEY else '❌ Missing'}")
    if not settings.OPENAI_API_KEY:
        print("   ERROR: Set OPENAI_API_KEY in .env")
        return False
    
    try:
        # Initialize AI service (same as backend)
        print("\n2. Initializing AI Service...")
        ai_service = AIService()
        print("   ✅ AI Service initialized")
        
        # Test structuring (same as upload endpoint)
        print("\n3. Testing CV structuring with sample CV...")
        print(f"   Sample CV length: {len(SAMPLE_CV_TEXT)} characters")
        print("   Sending to OpenAI API...")
        
        cv_structure = ai_service.structure_cv_text(SAMPLE_CV_TEXT)
        
        if cv_structure is None:
            print("\n❌ FAILED: structure_cv_text returned None")
            print("\nThis means the AI call failed. Check backend logs above for details.")
            return False
        
        print("\n   ✅ CV structured successfully!")
        
        # Show results
        print("\n4. Structured data preview:")
        print(f"   Name: {cv_structure.personal_info.full_name}")
        print(f"   Email: {cv_structure.personal_info.email}")
        print(f"   Work experiences: {len(cv_structure.work_experience)}")
        print(f"   Skills: {len(cv_structure.skills)}")
        print(f"   Education: {len(cv_structure.education)}")
        
        if cv_structure.work_experience:
            print(f"\n   First job: {cv_structure.work_experience[0].position}")
            print(f"   Company: {cv_structure.work_experience[0].company}")
        
        # Test embeddings (optional, fast)
        print("\n5. Testing embeddings generation...")
        test_text = cv_structure.personal_info.full_name
        embedding = ai_service.generate_embeddings(test_text)
        
        if embedding:
            print(f"   ✅ Embeddings generated: {len(embedding)} dimensions")
        else:
            print("   ⚠️  Embeddings failed (not critical)")
        
        print("\n" + "=" * 70)
        print("✅ ALL TESTS PASSED!")
        print("=" * 70)
        print("\nYour CV structuring works correctly.")
        print("If upload still fails, the problem is elsewhere (PDF parsing, database, etc.)")
        return True
        
    except Exception as e:
        print(f"\n❌ ERROR: {str(e)}")
        print("\nFull error details:")
        import traceback
        traceback.print_exc()
        
        print("\n" + "=" * 70)
        print("Debugging tips:")
        print("=" * 70)
        print("1. Check if the model 'gpt-4o' is available for your account")
        print("2. Try changing model to 'gpt-3.5-turbo' in ai_service.py")
        print("3. Check OpenAI usage: https://platform.openai.com/usage")
        print("4. Check for rate limits or quota issues")
        
        return False

if __name__ == "__main__":
    success = test_cv_structuring()
    sys.exit(0 if success else 1)
